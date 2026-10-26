/**
 * The contact form in the browser: checks the fields with the same rules as the server, shows
 * errors next to each field, gets a Turnstile token, posts to /api/contact and shows a thank-you.
 * Markup contract: see ContactPage.astro.
 */
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client';
import {
  CONTACT_FIELDS,
  validateContact,
  type ContactField,
  type ContactResponse,
  type FieldError,
} from '~/lib/contact/form';
import { turnstileToken } from './turnstile';

interface ContactStrings {
  errors: Record<FieldError, string>;
  limits: { name: number; email: number; message: number; messageMin: number };
  summary: string;
  rate_limited: string;
  verify: string;
  unavailable: string;
  network: string;
  send: string;
  sending: string;
  successTitle: string;
  successText: string;
}

export function mountContactForm(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-contact-form]');
  const panel = root.querySelector<HTMLElement>('[data-contact-panel]');
  const submit = root.querySelector<HTMLButtonElement>('[data-contact-submit]');
  const formError = root.querySelector<HTMLElement>('[data-contact-error]');
  const turnstileBox = root.querySelector<HTMLElement>('[data-contact-turnstile]');
  const success = root.querySelector<HTMLElement>('[data-contact-success]');
  const successTitle = root.querySelector<HTMLElement>('[data-contact-success-title]');
  const successText = root.querySelector<HTMLElement>('[data-contact-success-text]');
  const again = root.querySelector<HTMLButtonElement>('[data-contact-again]');
  if (
    !form ||
    !panel ||
    !submit ||
    !formError ||
    !turnstileBox ||
    !success ||
    !successTitle ||
    !successText ||
    !again
  ) {
    return;
  }

  const strings = JSON.parse(root.dataset['strings'] ?? '{}') as ContactStrings;
  const language = root.dataset['lang'] ?? document.documentElement.lang;
  const control = (name: ContactField) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
  const errorFor = (name: ContactField) => root.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
  let sending = false;

  const message = (name: ContactField, code: FieldError) => {
    const n = code === 'too_short' ? strings.limits.messageMin : code === 'too_long' ? strings.limits[name] : undefined;
    return strings.errors[code].replace('{n}', String(n ?? ''));
  };

  const showFieldError = (name: ContactField, code: FieldError | undefined) => {
    const input = control(name);
    const error = errorFor(name);
    if (code) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (error) {
      error.textContent = code ? message(name, code) : '';
      error.hidden = !code;
    }
  };

  const values = () => ({
    name: control('name').value,
    email: control('email').value,
    message: control('message').value,
  });

  /** Shows the given field errors; returns true (and focuses the first problem) if there were any. */
  const showErrors = (errors: Partial<Record<ContactField, FieldError>>) => {
    for (const name of CONTACT_FIELDS) showFieldError(name, errors[name]);
    const first = CONTACT_FIELDS.find((name) => errors[name]);
    if (first) control(first).focus();
    return Boolean(first);
  };

  // Once a field has shown an error, re-check it while the visitor fixes it.
  for (const name of CONTACT_FIELDS) {
    control(name).addEventListener('input', () => {
      if (control(name).getAttribute('aria-invalid') !== 'true') return;
      const result = validateContact(values());
      showFieldError(name, result.ok ? undefined : result.errors[name]);
    });
  }

  const setSending = (value: boolean) => {
    sending = value;
    submit.disabled = value;
    submit.textContent = value ? strings.sending : strings.send;
    form.setAttribute('aria-busy', String(value));
  };

  const showFormError = (text: string) => {
    formError.textContent = text;
  };

  const showSuccess = (name: string, email: string) => {
    successTitle.textContent = strings.successTitle.replace('{name}', name.trim().split(/\s+/)[0] ?? '');
    successText.textContent = strings.successText.replace('{email}', email.trim());
    panel.hidden = true;
    success.hidden = false;
    successTitle.focus();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    showFormError('');

    const fields = values();
    const result = validateContact(fields);
    if (!result.ok) {
      showErrors(result.errors);
      showFormError(strings.summary);
      return;
    }

    setSending(true);
    try {
      const siteKey = PUBLIC_TURNSTILE_SITE_KEY;
      const token = siteKey ? await turnstileToken(turnstileBox, siteKey, language).catch(() => null) : undefined;
      if (token === null) {
        showFormError(strings.verify);
        return;
      }
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          website: (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '',
          locale: document.documentElement.lang.startsWith('pl') ? 'pl' : 'en',
          ...(token ? { turnstileToken: token } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as ContactResponse | null;
      if (response.ok && body?.ok) {
        showSuccess(fields.name, fields.email);
        form.reset();
        return;
      }
      const error = body && 'error' in body ? body : undefined;
      if (error?.error === 'invalid' && error.fields) {
        showErrors(error.fields);
        showFormError(strings.summary);
      } else if (error?.error === 'rate_limited') {
        showFormError(strings.rate_limited.replace('{minutes}', String(Math.ceil((error.retryAfter ?? 600) / 60))));
      } else if (error?.error === 'verify') {
        showFormError(strings.verify);
      } else {
        showFormError(strings.unavailable);
      }
    } catch {
      showFormError(strings.network);
    } finally {
      setSending(false);
    }
  });

  again.addEventListener('click', () => {
    success.hidden = true;
    panel.hidden = false;
    control('name').focus();
  });
}
