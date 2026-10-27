/** Sends one plain-text email through Resend's REST API (resend.com/docs/api-reference/emails/send-email). */

export class ResendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Email {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  /** Resend drops a repeat with the same key within 24 hours, so a retried request can't send twice. */
  idempotencyKey?: string;
}

export async function sendWithResend(apiKey: string, email: Email, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ResendError(`Resend answered ${response.status}: ${detail.slice(0, 300)}`, response.status);
  }
}
