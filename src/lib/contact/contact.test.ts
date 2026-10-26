import { describe, expect, it } from 'vitest';
import { MemoryStore } from '~/lib/byte/store';
import { validateContact } from './form';
import { composeEmail, handleContact, type ContactDeps } from './handler';
import { ResendError, sendWithResend } from './resend';

const NOW = new Date('2026-10-26T12:00:00Z');
const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Hi Piotr, want to talk about an internship?',
};

describe('validateContact', () => {
  it('accepts a filled-in form and tidies it', () => {
    expect(
      validateContact({ name: '  Ada\n Lovelace ', email: ' ada@example.com ', message: ' Hello there!\r\n ' }),
    ).toEqual({
      ok: true,
      data: { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there!' },
    });
  });

  it('reports each problem by field', () => {
    expect(validateContact({})).toEqual({
      ok: false,
      errors: { name: 'required', email: 'required', message: 'required' },
    });
    expect(validateContact({ name: 'x'.repeat(101), email: 'not-an-email', message: 'Too short' })).toEqual({
      ok: false,
      errors: { name: 'too_long', email: 'email', message: 'too_short' },
    });
    expect(validateContact({ ...valid, message: 'x'.repeat(5001) })).toEqual({
      ok: false,
      errors: { message: 'too_long' },
    });
  });

  it('ignores values that are not strings', () => {
    expect(validateContact({ name: 42, email: ['a@b.co'], message: null })).toMatchObject({ ok: false });
  });
});

describe('handleContact', () => {
  function setup(overrides: Partial<ContactDeps> = {}) {
    const sent: Parameters<NonNullable<ContactDeps['send']>>[0][] = [];
    const deps: ContactDeps = {
      send: async (email) => void sent.push(email),
      store: new MemoryStore(() => NOW.getTime()),
      verifyTurnstile: null,
      siteName: 'piotrplotast.vercel.app',
      now: () => NOW,
      log: () => undefined,
      ...overrides,
    };
    return { deps, sent };
  }

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://piotrplotast.vercel.app/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://piotrplotast.vercel.app', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('sends the message to the inbox with the visitor as reply-to', async () => {
    const { deps, sent } = setup();
    const response = await handleContact(post({ ...valid, locale: 'pl' }), '1.2.3.4', deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      replyTo: 'ada@example.com',
      subject: 'New message from Ada Lovelace via piotrplotast.vercel.app',
      idempotencyKey: expect.stringMatching(/^contact-[0-9a-f]{32}$/),
    });
    expect(sent[0]?.text).toContain('Language: Polski');
    expect(sent[0]?.text).toContain(valid.message);
  });

  it('returns field errors without sending or counting towards the rate limit', async () => {
    const { deps, sent } = setup();
    const response = await handleContact(post({ name: '', email: 'x', message: 'hey' }), '1.2.3.4', deps);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'invalid',
      fields: { name: 'required', email: 'email', message: 'too_short' },
    });
    expect(sent).toHaveLength(0);
    expect((deps.store as unknown as { entries: Map<string, unknown> }).entries.size).toBe(0);
  });

  it('quietly drops submissions that fill the hidden honeypot field', async () => {
    const { deps, sent } = setup();
    const response = await handleContact(post({ ...valid, website: 'http://spam.example' }), '1.2.3.4', deps);
    expect(await response.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it('rejects other sites and malformed bodies', async () => {
    const { deps } = setup();
    expect((await handleContact(post(valid, { origin: 'https://evil.example' }), undefined, deps)).status).toBe(403);
    expect((await handleContact(post('not json'), undefined, deps)).status).toBe(400);
    expect((await handleContact(post([valid]), undefined, deps)).status).toBe(400);
    expect((await handleContact(post({ ...valid, message: 'x'.repeat(20_000) }), undefined, deps)).status).toBe(413);
  });

  it('rate limits each visitor', async () => {
    const { deps, sent } = setup();
    for (let i = 0; i < 3; i++) expect((await handleContact(post(valid), '1.2.3.4', deps)).status).toBe(200);
    const limited = await handleContact(post(valid), '1.2.3.4', deps);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited', retryAfter: 600 });
    expect(sent).toHaveLength(3);
    expect((await handleContact(post(valid), '5.6.7.8', deps)).status).toBe(200);
  });

  it('keeps its counters separate from the chat', async () => {
    const { deps } = setup();
    await handleContact(post(valid), '1.2.3.4', deps);
    const keys = [...(deps.store as unknown as { entries: Map<string, unknown> }).entries.keys()];
    expect(keys.every((key) => key.startsWith('contact:rl:'))).toBe(true);
  });

  it('requires a valid Turnstile token when the bot check is configured', async () => {
    const { deps, sent } = setup({ verifyTurnstile: async (token) => token === 'good' });
    expect(await (await handleContact(post(valid), undefined, deps)).json()).toEqual({ error: 'verify' });
    expect((await handleContact(post({ ...valid, turnstileToken: 'bad' }), undefined, deps)).status).toBe(403);
    expect((await handleContact(post({ ...valid, turnstileToken: 'good' }), undefined, deps)).status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('says the form is unavailable when email is not configured or sending fails', async () => {
    const unconfigured = setup({ send: null });
    expect(await (await handleContact(post(valid), undefined, unconfigured.deps)).json()).toEqual({
      error: 'unavailable',
    });

    const failing = setup({
      send: async () => {
        throw new ResendError('Resend answered 500', 500);
      },
    });
    const response = await handleContact(post(valid), undefined, failing.deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });

  it('writes a readable plain-text email', () => {
    expect(composeEmail(valid, 'en', 'example.com')).toEqual({
      replyTo: 'ada@example.com',
      subject: 'New message from Ada Lovelace via example.com',
      text: [
        'Ada Lovelace wrote through the contact form on example.com.',
        'Reply to this email to answer them at ada@example.com.',
        '',
        'Language: English',
        '',
        valid.message,
      ].join('\n'),
    });
  });
});

describe('sendWithResend', () => {
  const email = {
    from: 'Form <onboarding@resend.dev>',
    to: 'me@example.com',
    replyTo: 'ada@example.com',
    subject: 'Hi',
    text: 'Body',
    idempotencyKey: 'k1',
  };

  it("posts to Resend's send-email endpoint", async () => {
    let request: Request | undefined;
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return Response.json({ id: 'email_1' });
    }) as typeof fetch;
    await sendWithResend('re_test', email, fakeFetch);
    expect(request?.url).toBe('https://api.resend.com/emails');
    expect(request?.method).toBe('POST');
    expect(request?.headers.get('authorization')).toBe('Bearer re_test');
    expect(request?.headers.get('idempotency-key')).toBe('k1');
    expect(await request?.json()).toEqual({
      from: 'Form <onboarding@resend.dev>',
      to: ['me@example.com'],
      reply_to: 'ada@example.com',
      subject: 'Hi',
      text: 'Body',
    });
  });

  it('throws on an error response', async () => {
    const failing = (async () => Response.json({ message: 'Invalid `to` field' }, { status: 422 })) as typeof fetch;
    await expect(sendWithResend('re_test', email, failing)).rejects.toMatchObject({ status: 422 });
  });
});
