/**
 * After a visitor passes Turnstile once, a signed cookie lets them keep chatting without another
 * check. The cookie holds only an expiry time and an HMAC of it; nothing about the visitor.
 */

export const SESSION_COOKIE = 'byte_session';

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`byte-session:${data}`)));
  return btoa(String.fromCharCode(...signature))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function createSession(secret: string, now: Date, seconds: number): Promise<string> {
  const expires = String(Math.floor(now.getTime() / 1000) + seconds);
  return `${expires}.${await hmac(secret, expires)}`;
}

export async function verifySession(secret: string, value: string | undefined, now: Date): Promise<boolean> {
  if (!value) return false;
  const [expires, signature] = value.split('.');
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) <= now.getTime() / 1000) return false;
  const expected = await hmac(secret, expires);
  // Constant-time comparison: don't leak how many leading characters matched.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

export function sessionCookie(value: string, seconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    'Path=/api',
    `Max-Age=${seconds}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
