import { describe, expect, it } from 'vitest';
import { costMicros, dollarsToMicros } from './cost';
import { recordSpend, takeRateLimit, visitorId, withinBudget } from './limits';
import { createEventParser, encodeEvent, type ByteEvent } from './protocol';
import { parseChatRequest } from './request';
import { createSession, readCookie, sessionCookie, verifySession } from './session';
import { MemoryStore } from './store';
import { verifyTurnstile } from './turnstile';

describe('costMicros', () => {
  it('prices each kind of token', () => {
    // 10K uncached in, 1K out: 10_000 × $0.10/M + 1_000 × $0.50/M = $0.0015.
    expect(costMicros({ input_tokens: 10_000, output_tokens: 1_000 })).toBe(1500);
    // Cache reads cost a tenth of normal input, writes a quarter more.
    expect(costMicros({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000 })).toBe(100);
    expect(costMicros({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000 })).toBe(1250);
  });

  it('uses the long-context rates above 100K prompt tokens', () => {
    expect(costMicros({ input_tokens: 200_000, output_tokens: 0 })).toBe(100_000);
  });

  it('rounds up', () => {
    expect(costMicros({ input_tokens: 1, output_tokens: 0 })).toBe(1);
  });
});

describe('rate limits', () => {
  const limits = [{ window: 600, max: 2 }];

  it('allows up to the limit per window, then says when to retry', async () => {
    const store = new MemoryStore();
    const now = new Date('2026-10-21T12:00:00Z');
    expect(await takeRateLimit(store, 'a', now, limits)).toEqual({ ok: true });
    expect(await takeRateLimit(store, 'a', now, limits)).toEqual({ ok: true });
    expect(await takeRateLimit(store, 'a', now, limits)).toEqual({ ok: false, retryAfter: 600 });
    // Other visitors have their own count.
    expect(await takeRateLimit(store, 'b', now, limits)).toEqual({ ok: true });
    // The next window starts fresh.
    expect(await takeRateLimit(store, 'a', new Date('2026-10-21T12:10:00Z'), limits)).toEqual({ ok: true });
  });

  it('hashes visitor IPs', async () => {
    const id = await visitorId('203.0.113.7');
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(id).not.toContain('203');
    expect(await visitorId('203.0.113.7')).toBe(id);
  });
});

describe('budget', () => {
  const budget = { daily: 0.01, monthly: 0.015 };
  const day1 = new Date('2026-10-21T12:00:00Z');
  const day2 = new Date('2026-10-22T12:00:00Z');

  it('stops at the daily cap and resets the next day', async () => {
    const store = new MemoryStore(() => day1.getTime());
    expect(await withinBudget(store, day1, budget)).toBe(true);
    await recordSpend(store, day1, dollarsToMicros(0.01));
    expect(await withinBudget(store, day1, budget)).toBe(false);
    expect(await withinBudget(store, day2, budget)).toBe(true);
  });

  it('stops at the monthly cap', async () => {
    const store = new MemoryStore(() => day1.getTime());
    await recordSpend(store, day1, dollarsToMicros(0.008));
    await recordSpend(store, day2, dollarsToMicros(0.008));
    expect(await withinBudget(store, day2, budget)).toBe(false);
  });
});

describe('MemoryStore', () => {
  it('expires keys after their time-to-live', async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    await store.incrBy('k', 2, 10);
    expect(await store.incrBy('k', 3, 10)).toBe(5);
    now = 10_000;
    expect(await store.get('k')).toBeNull();
    await store.set('s', 'v', 1);
    expect(await store.get('s')).toBe('v');
  });
});

describe('session cookie', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  it('accepts its own signature until it expires', async () => {
    const value = await createSession('secret', now, 60);
    expect(await verifySession('secret', value, now)).toBe(true);
    expect(await verifySession('secret', value, new Date(now.getTime() + 61_000))).toBe(false);
  });

  it('rejects tampering and other secrets', async () => {
    const value = await createSession('secret', now, 60);
    const [, signature] = value.split('.');
    expect(await verifySession('other', value, now)).toBe(false);
    expect(await verifySession('secret', `9999999999.${signature}`, now)).toBe(false);
    expect(await verifySession('secret', 'garbage', now)).toBe(false);
    expect(await verifySession('secret', undefined, now)).toBe(false);
  });

  it('reads and writes the cookie header', () => {
    expect(readCookie('a=1; byte_session=123.abc=; b=2', 'byte_session')).toBe('123.abc=');
    expect(readCookie(null, 'byte_session')).toBeUndefined();
    expect(sessionCookie('v', 60, true)).toBe(
      'byte_session=v; Path=/api; Max-Age=60; HttpOnly; SameSite=Strict; Secure',
    );
  });
});

describe('verifyTurnstile', () => {
  const respond = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as typeof fetch;

  it('trusts only a successful siteverify answer', async () => {
    expect(await verifyTurnstile('t', 's', '1.2.3.4', respond({ success: true }))).toBe(true);
    expect(await verifyTurnstile('t', 's', undefined, respond({ success: false }))).toBe(false);
    expect(await verifyTurnstile('t', 's', undefined, respond({ success: true }, 500))).toBe(false);
  });

  it('sends the secret, token and visitor IP', async () => {
    let sent: URLSearchParams | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return Response.json({ success: true });
    }) as typeof fetch;
    await verifyTurnstile('token', 'secret', '1.2.3.4', spy);
    expect(Object.fromEntries(sent ?? [])).toEqual({ secret: 'secret', response: 'token', remoteip: '1.2.3.4' });
  });

  it('treats network errors as a failed check', async () => {
    const broken = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await verifyTurnstile('t', 's', undefined, broken)).toBe(false);
  });
});

describe('parseChatRequest', () => {
  const ask = (messages: { role: string; text: string }[], locale = 'en') => parseChatRequest({ locale, messages });

  it('accepts a conversation that ends with a question', () => {
    expect(ask([{ role: 'user', text: ' Hi! ' }])).toEqual({
      locale: 'en',
      messages: [{ role: 'user', text: 'Hi!' }],
    });
  });

  it('rejects malformed requests', () => {
    expect(parseChatRequest(null)).toBeNull();
    expect(parseChatRequest({ locale: 'de', messages: [{ role: 'user', text: 'hi' }] })).toBeNull();
    expect(ask([])).toBeNull();
    expect(ask([{ role: 'system', text: 'hi' }])).toBeNull();
    expect(
      ask([
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' },
      ]),
    ).toBeNull();
    expect(ask([{ role: 'user', text: '   ' }])).toBeNull();
    expect(ask([{ role: 'user', text: 'x'.repeat(501) }])).toBeNull();
  });

  it('keeps only recent history, starting with a question', () => {
    const limits = { questionChars: 500, answerChars: 5, maxHistory: 3, bodyBytes: 1000 };
    const result = parseChatRequest(
      {
        locale: 'pl',
        messages: [
          { role: 'user', text: 'one' },
          { role: 'assistant', text: 'first answer' },
          { role: 'user', text: 'two' },
          { role: 'assistant', text: 'second answer' },
          { role: 'user', text: 'three' },
        ],
      },
      limits,
    );
    expect(result?.messages).toEqual([
      { role: 'user', text: 'two' },
      { role: 'assistant', text: 'secon' },
      { role: 'user', text: 'three' },
    ]);
  });

  it('merges consecutive turns from the same side', () => {
    expect(
      ask([
        { role: 'user', text: 'a' },
        { role: 'user', text: 'b' },
      ])?.messages,
    ).toEqual([{ role: 'user', text: 'a\n\nb' }]);
  });
});

describe('event stream', () => {
  it('round-trips events split across arbitrary chunks', () => {
    const events: ByteEvent[] = [
      { type: 'tool', name: 'get_github_repo', detail: 'reclaim' },
      { type: 'text', text: 'Hello\n\nworld' },
      { type: 'done' },
    ];
    const wire = events.map(encodeEvent).join('');
    const received: ByteEvent[] = [];
    const feed = createEventParser((event) => received.push(event));
    for (let i = 0; i < wire.length; i += 7) feed(wire.slice(i, i + 7));
    expect(received).toEqual(events);
  });
});
