import type Anthropic from '@anthropic-ai/sdk';
import { localeNames } from '~/i18n/config';
import { runAgent, type AgentOutcome, type CreateStream } from './agent';
import { EFFORT, INPUT_LIMITS, MAX_TOKENS, MODEL, SESSION_SECONDS } from './config';
import { costMicros } from './cost';
import type { GitHub } from './github';
import { systemPrompt, type Knowledge } from './knowledge';
import { recordSpend, takeRateLimit, visitorId, withinBudget } from './limits';
import { encodeEvent, type ByteErrorCode, type ByteEvent, type ErrorBody } from './protocol';
import { parseChatRequest } from './request';
import { createSession, readCookie, SESSION_COOKIE, sessionCookie, verifySession } from './session';
import type { Store } from './store';
import { createToolRunner, toolDefinitions } from './tools';

export interface ChatDeps {
  /** Null when no Anthropic API key is configured: Byte then politely says it's offline. */
  createStream: CreateStream | null;
  store: Store;
  github: GitHub;
  loadKnowledge: (locale: Knowledge['locale']) => Promise<Knowledge>;
  /** Null when Turnstile isn't configured (local development). */
  turnstile: { secret: string; verify: (token: string, ip: string | undefined) => Promise<boolean> } | null;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

export const TURNSTILE_HEADER = 'x-turnstile-token';

const fail = (status: number, error: ByteErrorCode, extra: Omit<ErrorBody, 'error'> = {}) =>
  Response.json({ error, ...extra } satisfies ErrorBody, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(extra.retryAfter ? { 'Retry-After': String(extra.retryAfter) } : {}) },
  });

/**
 * Browsers always send Origin on POST; refusing other sites keeps them from using Byte from their
 * pages. Behind a proxy (Vercel) the public host may only be in Host / X-Forwarded-Host, so any of
 * them counts. (A cross-site page can't set those headers without a CORS preflight, which fails.)
 */
function sameSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [new URL(request.url).host, request.headers.get('host'), request.headers.get('x-forwarded-host')];
  return hosts.includes(host);
}

const outcomeError: Record<Exclude<AgentOutcome, 'done' | 'aborted'>, ByteErrorCode> = {
  refusal: 'refusal',
  busy: 'busy',
  error: 'unavailable',
};

/**
 * POST /api/chat. Checks run cheapest first: request shape, rate limit, bot check, budget; only
 * then is Claude called. The answer streams back as events (see protocol.ts).
 */
export async function handleChat(request: Request, ip: string | undefined, deps: ChatDeps): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? console.error;

  if (!sameSite(request)) return fail(403, 'bad_request');

  const raw = await request.text();
  if (raw.length > INPUT_LIMITS.bodyBytes) return fail(413, 'bad_request');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'bad_request');
  }
  const chat = parseChatRequest(body);
  if (!chat) return fail(400, 'bad_request');

  const { createStream } = deps;
  if (!createStream) return fail(503, 'unavailable');

  const limit = await takeRateLimit(deps.store, await visitorId(ip ?? 'unknown'), now());
  if (!limit.ok) return fail(429, 'rate_limited', { retryAfter: limit.retryAfter });

  let setCookie: string | undefined;
  if (deps.turnstile) {
    const { secret, verify } = deps.turnstile;
    const session = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
    if (!(await verifySession(secret, session, now()))) {
      const token = request.headers.get(TURNSTILE_HEADER);
      if (!token || !(await verify(token, ip))) return fail(403, 'verify');
      const secure = new URL(request.url).protocol === 'https:';
      setCookie = sessionCookie(await createSession(secret, now(), SESSION_SECONDS), SESSION_SECONDS, secure);
    }
  }

  if (!(await withinBudget(deps.store, now()))) return fail(503, 'budget');

  const knowledge = await deps.loadKnowledge(chat.locale);
  const params: Omit<Anthropic.MessageStreamParams, 'messages'> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Thinking stays on (adaptive, the default); low effort keeps it short.
    output_config: { effort: EFFORT },
    tools: toolDefinitions,
    system: [
      // Stable per locale and deploy, so it's cached; the volatile line comes after the breakpoint.
      { type: 'text', text: systemPrompt(knowledge), cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: `Today is ${now().toISOString().slice(0, 10)}. The visitor is reading the ${localeNames[chat.locale]} version of the site.`,
      },
    ],
  };

  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ByteEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The visitor went away; the abort signal stops the model shortly.
        }
      };
      const outcome = await runAgent({
        createStream,
        params,
        messages: chat.messages.map(({ role, text }) => ({ role, content: text })),
        runTool: createToolRunner(knowledge, deps.github),
        emit: send,
        onUsage: (usage) =>
          recordSpend(deps.store, now(), costMicros(usage)).catch((error) => log('Byte: spend', error)),
        signal: abort.signal,
        log,
      }).catch((error: unknown): AgentOutcome => {
        log('Byte: unexpected failure', error);
        return 'error';
      });
      if (outcome === 'done') send({ type: 'done' });
      else if (outcome !== 'aborted') send({ type: 'error', code: outcomeError[outcome] });
      try {
        controller.close();
      } catch {
        // Already closed by a disconnect.
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
    },
  });
}
