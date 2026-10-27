/**
 * Cloudflare Turnstile, the invisible bot check used by Byte and the contact form. The script is
 * loaded only when a token is first needed, and stays invisible unless Cloudflare wants a click.
 */

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

let turnstileScript: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
  turnstileScript ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (turnstile) resolve(turnstile);
      else reject(new Error('Turnstile missing'));
    };
    script.onerror = () => {
      turnstileScript = undefined;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.append(script);
  });
  return turnstileScript;
}

export async function turnstileToken(container: HTMLElement, siteKey: string, language: string): Promise<string> {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    let id = '';
    const finish = (settle: () => void) => {
      settle();
      // Tokens are single-use; a fresh widget is rendered for the next check.
      queueMicrotask(() => turnstile.remove(id));
    };
    id = turnstile.render(container, {
      sitekey: siteKey,
      // Invisible unless Cloudflare needs the visitor to click something.
      appearance: 'interaction-only',
      language,
      callback: (token: string) => finish(() => resolve(token)),
      'error-callback': () => finish(() => reject(new Error('Turnstile error'))),
      'expired-callback': () => finish(() => reject(new Error('Turnstile expired'))),
    });
  });
}
