import { isLocale, localeNames } from '~/i18n/config';
import { takeRateLimit, visitorId } from '~/lib/byte/limits';
import type { Store } from '~/lib/byte/store';
import { sameSite } from '~/lib/same-site';
import { validateContact, type ContactMessage, type ContactResponse } from './form';

export interface ContactDeps {
  /** Null when Resend isn't configured: the form then says it's unavailable. */
  send: ((email: { replyTo: string; subject: string; text: string; idempotencyKey: string }) => Promise<void>) | null;
  store: Store;
  /** Null when Turnstile isn't configured (local development). */
  verifyTurnstile: ((token: string, ip: string | undefined) => Promise<boolean>) | null;
  /** Shown in the email, e.g. "piotrplotast.vercel.app". */
  siteName: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** Per visitor. Real people rarely send more than one; this stops a script flooding the inbox. */
export const CONTACT_RATE_LIMITS = [
  { window: 10 * 60, max: 3 },
  { window: 24 * 60 * 60, max: 10 },
] as const;

const BODY_BYTES = 16 * 1024;

const reply = (status: number, body: ContactResponse) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...('retryAfter' in body && body.retryAfter ? { 'Retry-After': String(body.retryAfter) } : {}),
    },
  });

export function composeEmail(message: ContactMessage, locale: string, siteName: string) {
  return {
    replyTo: message.email,
    subject: `New message from ${message.name} via ${siteName}`,
    text: [
      `${message.name} wrote through the contact form on ${siteName}.`,
      `Reply to this email to answer them at ${message.email}.`,
      '',
      `Language: ${isLocale(locale) ? localeNames[locale] : locale}`,
      '',
      message.message,
    ].join('\n'),
  };
}

async function idempotencyKey(message: ContactMessage, now: Date): Promise<string> {
  // Same sender and text within the same hour counts as one message (double clicks, retries).
  const hour = now.toISOString().slice(0, 13);
  const data = new TextEncoder().encode(`${hour}|${message.email}|${message.message}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return `contact-${[...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * POST /api/contact. Checks run cheapest first: same site, shape, the hidden honeypot field,
 * field rules, rate limit, bot check; only then is the email sent.
 */
export async function handleContact(request: Request, ip: string | undefined, deps: ContactDeps): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? console.error;

  if (!sameSite(request)) return reply(403, { error: 'bad_request' });

  const raw = await request.text();
  if (raw.length > BODY_BYTES) return reply(413, { error: 'bad_request' });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return reply(400, { error: 'bad_request' });
  }

  // A field people never see. Bots that fill every input get a cheerful "sent" and nothing happens.
  if (typeof body['website'] === 'string' && body['website'].trim()) return reply(200, { ok: true });

  const result = validateContact(body);
  if (!result.ok) return reply(422, { error: 'invalid', fields: result.errors });

  if (!deps.send) return reply(503, { error: 'unavailable' });

  const limit = await takeRateLimit(
    deps.store,
    await visitorId(ip ?? 'unknown'),
    now(),
    CONTACT_RATE_LIMITS,
    'contact',
  );
  if (!limit.ok) return reply(429, { error: 'rate_limited', retryAfter: limit.retryAfter });

  if (deps.verifyTurnstile) {
    const token = body['turnstileToken'];
    if (typeof token !== 'string' || !token || !(await deps.verifyTurnstile(token, ip))) {
      return reply(403, { error: 'verify' });
    }
  }

  const locale = typeof body['locale'] === 'string' ? body['locale'] : 'en';
  try {
    await deps.send({
      ...composeEmail(result.data, locale, deps.siteName),
      idempotencyKey: await idempotencyKey(result.data, now()),
    });
  } catch (error) {
    log('Contact: sending failed', error);
    return reply(502, { error: 'unavailable' });
  }
  return reply(200, { ok: true });
}
