/**
 * The contact form's fields and their rules. Plain functions with no server imports, so the
 * browser script checks exactly what /api/contact checks.
 */

export const CONTACT_LIMITS = {
  name: 100,
  email: 200,
  messageMin: 10,
  messageMax: 5000,
};

export const CONTACT_FIELDS = ['name', 'email', 'message'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type FieldError = 'required' | 'email' | 'too_short' | 'too_long';

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

/** Something@something.tld, no spaces. Real deliverability is the reply's job. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function validateContact(
  input: Record<string, unknown>,
): { ok: true; data: ContactMessage } | { ok: false; errors: Partial<Record<ContactField, FieldError>> } {
  // Names and emails are single-line: collapse whitespace so nothing can sneak into a subject line.
  const name = text(input['name']).replace(/\s+/g, ' ').trim();
  const email = text(input['email']).replace(/\s+/g, '').trim();
  const message = text(input['message']).replace(/\r\n?/g, '\n').trim();
  const errors: Partial<Record<ContactField, FieldError>> = {};

  if (!name) errors.name = 'required';
  else if (name.length > CONTACT_LIMITS.name) errors.name = 'too_long';

  if (!email) errors.email = 'required';
  else if (email.length > CONTACT_LIMITS.email) errors.email = 'too_long';
  else if (!EMAIL.test(email)) errors.email = 'email';

  if (!message) errors.message = 'required';
  else if (message.length < CONTACT_LIMITS.messageMin) errors.message = 'too_short';
  else if (message.length > CONTACT_LIMITS.messageMax) errors.message = 'too_long';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { name, email, message } };
}

export type ContactErrorCode = 'invalid' | 'rate_limited' | 'verify' | 'unavailable' | 'bad_request';

/** What /api/contact answers: `{ ok: true }`, or an error with per-field codes for `invalid`. */
export type ContactResponse =
  | { ok: true }
  | { ok?: false; error: ContactErrorCode; fields?: Partial<Record<ContactField, FieldError>>; retryAfter?: number };
