/**
 * Browsers always send Origin on POST; refusing other sites keeps them from calling our endpoints
 * from their pages. Behind a proxy (Vercel) the public host may only be in Host or
 * X-Forwarded-Host, so any of them counts. (A cross-site page can't set those headers without a
 * CORS preflight, which fails.)
 */
export function sameSite(request: Request): boolean {
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
