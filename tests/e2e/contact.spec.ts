import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The contact form against a fake /api/contact (the static preview has no server, and tests must
 * never send real email). The server side is covered by src/lib/contact/contact.test.ts.
 */

const name = (page: Page) => page.getByRole('textbox', { name: /Your name/ });
const email = (page: Page) => page.getByRole('textbox', { name: /Your email/ });
const message = (page: Page) => page.getByRole('textbox', { name: /Message/ });
const send = (page: Page) => page.getByRole('button', { name: 'Send message' });

async function fill(page: Page) {
  await name(page).fill('Ada Lovelace');
  await email(page).fill('ada@example.com');
  await message(page).fill('Hi Piotr, want to talk about an internship?');
}

async function mockContact(page: Page, respond: (route: Route) => Promise<void> | void) {
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/contact', async (route) => {
    bodies.push(route.request().postDataJSON());
    await respond(route);
  });
  return bodies;
}

test.describe('contact form', () => {
  test('explains every problem next to its field and focuses the first one', async ({ page }) => {
    const bodies = await mockContact(page, (route) => route.fulfill({ json: { ok: true } }));
    await page.goto('/contact/');
    await send(page).click();

    await expect(name(page)).toBeFocused();
    await expect(name(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(name(page)).toHaveAccessibleDescription('Please fill in this field.');
    await expect(email(page)).toHaveAccessibleDescription(/So I can reply\..*Please fill in this field\./);
    await expect(page.getByRole('alert')).toHaveText('Please fix the highlighted fields.');

    await email(page).fill('not-an-email');
    await expect(email(page)).toHaveAccessibleDescription(/Please enter an email address like name@example.com\./);
    await message(page).fill('Too short');
    await expect(message(page)).toHaveAccessibleDescription(/Please write at least 10 characters\./);

    // Fixing a field clears its error as you type.
    await name(page).fill('Ada');
    await expect(name(page)).not.toHaveAttribute('aria-invalid');
    expect(bodies).toHaveLength(0);
  });

  test('sends the message and thanks the sender', async ({ page }) => {
    const bodies = await mockContact(page, (route) => route.fulfill({ json: { ok: true } }));
    await page.goto('/contact/');
    await fill(page);
    await send(page).click();

    const thanks = page.getByRole('heading', { name: 'Thanks, Ada!' });
    await expect(thanks).toBeFocused();
    await expect(page.getByText('I’ll reply to ada@example.com soon.')).toBeVisible();
    expect(bodies).toEqual([
      {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'Hi Piotr, want to talk about an internship?',
        website: '',
        locale: 'en',
      },
    ]);

    await page.getByRole('button', { name: 'Send another message' }).click();
    await expect(name(page)).toBeFocused();
    await expect(name(page)).toHaveValue('');
  });

  test('shows errors the server found in a field', async ({ page }) => {
    await mockContact(page, (route) =>
      route.fulfill({ status: 422, json: { error: 'invalid', fields: { email: 'email' } } }),
    );
    await page.goto('/contact/');
    await fill(page);
    await send(page).click();
    await expect(email(page)).toBeFocused();
    await expect(email(page)).toHaveAttribute('aria-invalid', 'true');
  });

  const failures = [
    {
      name: 'rate limit',
      response: { status: 429, json: { error: 'rate_limited', retryAfter: 300 } },
      text: 'You’ve sent a few messages already. Please try again in 5 min.',
    },
    { name: 'failed bot check', response: { status: 403, json: { error: 'verify' } }, text: /confirm you’re human/ },
    { name: 'outage', response: { status: 503, json: { error: 'unavailable' } }, text: /isn’t working right now/ },
  ];
  for (const { name: failure, response, text } of failures) {
    test(`explains a ${failure} and keeps what was typed`, async ({ page }) => {
      await mockContact(page, (route) => route.fulfill(response));
      await page.goto('/contact/');
      await fill(page);
      await send(page).click();
      await expect(page.getByRole('alert')).toHaveText(text);
      await expect(message(page)).toHaveValue('Hi Piotr, want to talk about an internship?');
      await expect(send(page)).toBeEnabled();
    });
  }

  test('says so when the server is unreachable', async ({ page }) => {
    await mockContact(page, (route) => route.abort('internetdisconnected'));
    await page.goto('/contact/');
    await fill(page);
    await send(page).click();
    await expect(page.getByRole('alert')).toHaveText(/Couldn’t reach the server/);
  });

  test('works in Polish', async ({ page }) => {
    const bodies = await mockContact(page, (route) => route.fulfill({ json: { ok: true } }));
    await page.goto('/pl/contact/');
    await page.getByRole('button', { name: 'Wyślij wiadomość' }).click();
    await expect(page.getByRole('textbox', { name: /Imię/ })).toHaveAccessibleDescription('Wypełnij to pole.');

    await page.getByRole('textbox', { name: /Imię/ }).fill('Jan Kowalski');
    await page.getByRole('textbox', { name: /e-mail/ }).fill('jan@example.pl');
    await page.getByRole('textbox', { name: /Wiadomość/ }).fill('Cześć, masz chwilę na rozmowę?');
    await page.getByRole('button', { name: 'Wyślij wiadomość' }).click();
    await expect(page.getByRole('heading', { name: 'Dzięki, Jan!' })).toBeVisible();
    expect(bodies[0]?.['locale']).toBe('pl');
  });

  test('lists the other ways to get in touch', async ({ page }) => {
    await page.goto('/contact/');
    const other = page.getByRole('complementary', { name: 'Other ways to reach me' });
    await expect(other.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/PiotrPlotast',
    );
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no axe violations with errors showing in ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/contact/');
      await send(page).click();
      await expect(page.getByRole('alert')).not.toBeEmpty();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
