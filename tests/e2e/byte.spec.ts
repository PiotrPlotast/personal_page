import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Byte's chat UI against a fake /api/chat (the static preview has no server, and CI must never
 * call Claude). The server side is covered by the unit tests in src/lib/byte.
 */

type Event =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; detail?: string }
  | { type: 'done' }
  | { type: 'error'; code: string };

const stream = (events: Event[]) => ({
  status: 200,
  headers: { 'content-type': 'text/event-stream' },
  body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
});

const answer: Event[] = [
  { type: 'tool', name: 'get_github_repo', detail: 'reclaim' },
  { type: 'text', text: '**Reclaim** is a desktop app. ' },
  { type: 'text', text: 'See [the case study](/projects/reclaim/).' },
  { type: 'done' },
];

/** Answers every question with `events`; returns the request bodies it received. */
async function mockByte(
  page: Page,
  respond: (route: Route) => Promise<void> | void = (r) => r.fulfill(stream(answer)),
) {
  const bodies: { locale: string; messages: { role: string; text: string }[] }[] = [];
  await page.route('**/api/chat', async (route) => {
    bodies.push(route.request().postDataJSON());
    await respond(route);
  });
  return bodies;
}

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

test.describe('Byte on the home page', () => {
  test('streams an answer with the lookups it made, and announces it once', async ({ page }) => {
    const bodies = await mockByte(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'What has he built?' }).click();

    const log = page.getByRole('log', { name: 'Conversation with Byte' });
    await expect(log.getByText('What has he built?')).toBeVisible();
    await expect(log.getByText('Checking GitHub: reclaim')).toBeVisible();
    await expect(log.locator('strong', { hasText: 'Reclaim' })).toBeVisible();
    await expect(log.getByRole('link', { name: 'the case study' })).toHaveAttribute('href', '/projects/reclaim/');
    await expect(page.getByRole('status').filter({ hasText: 'Byte: Reclaim is a desktop app.' })).toBeAttached();

    expect(bodies).toEqual([{ locale: 'en', messages: [{ role: 'user', text: 'What has he built?' }] }]);
  });

  test('sends the conversation so far with each new question', async ({ page }) => {
    const bodies = await mockByte(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'What has he built?' }).click();
    await expect(page.getByRole('link', { name: 'the case study' })).toBeVisible();

    const input = page.getByRole('textbox', { name: /Ask Byte a question/ });
    await input.fill('Which stack?');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.getByRole('link', { name: 'the case study' })).toHaveCount(2);
    expect(bodies[1]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(bodies[1]?.messages[1]?.text).toBe(
      '**Reclaim** is a desktop app. See [the case study](/projects/reclaim/).',
    );
  });

  test('keeps the conversation across reloads until it is cleared', async ({ page }) => {
    await mockByte(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'What has he built?' }).click();
    await expect(page.getByRole('link', { name: 'the case study' })).toBeVisible();

    await page.reload();
    const log = page.getByRole('log', { name: 'Conversation with Byte' });
    await expect(log.getByText('What has he built?')).toBeAttached();
    // Suggestions make way once a conversation exists.
    await expect(page.getByRole('button', { name: "What's his stack?" })).toBeHidden();

    await page.getByRole('button', { name: 'Clear conversation' }).click();
    await expect(log.getByText('What has he built?')).toHaveCount(0);
    await expect(page.getByRole('button', { name: "What's his stack?" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear conversation' })).toBeHidden();
  });

  test('can stop an answer', async ({ page }) => {
    let release: () => void = () => undefined;
    await mockByte(page, async (route) => {
      await new Promise<void>((resolve) => (release = resolve));
      await route.fulfill(stream(answer)).catch(() => undefined);
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'What has he built?' }).click();
    const stop = page.getByRole('button', { name: 'Stop the answer' });
    await expect(stop).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send question' })).toBeHidden();

    await stop.click();
    await expect(page.getByRole('log').getByText('Stopped.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send question' })).toBeVisible();
    release();
    // An unanswered question isn't kept in the history.
    expect(await page.evaluate(() => localStorage.getItem('byte:conversation'))).toBe('[]');
  });

  const errors = [
    {
      name: 'rate limit',
      response: { status: 429, json: { error: 'rate_limited', retryAfter: 300 } },
      text: 'Give me 5 min to catch my breath.',
    },
    {
      name: 'spending cap',
      response: { status: 503, json: { error: 'budget' } },
      text: "I'm out of coffee for today",
    },
    {
      name: 'mid-answer failure',
      response: stream([{ type: 'error', code: 'busy' }]),
      text: 'Lots of people are talking to me at once.',
    },
  ];
  for (const { name, response, text } of errors) {
    test(`explains a ${name}`, async ({ page }) => {
      await mockByte(page, (route) => route.fulfill(response));
      await page.goto('/');
      await page.getByRole('button', { name: 'What has he built?' }).click();
      await expect(page.getByRole('log').getByText(text)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send question' })).toBeVisible();
    });
  }

  test('says so when the server is unreachable', async ({ page }) => {
    await mockByte(page, (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    await page.getByRole('button', { name: 'What has he built?' }).click();
    await expect(page.getByRole('log').getByText("I couldn't reach the server.")).toBeVisible();
  });

  test('links to the contact page when Byte is out of budget', async ({ page }) => {
    await mockByte(page, (route) => route.fulfill({ status: 503, json: { error: 'budget' } }));
    await page.goto('/pl/');
    await page.getByRole('button', { name: 'Co zbudował?' }).click();
    await expect(page.getByRole('log').getByRole('link', { name: 'stronę kontaktu' })).toHaveAttribute(
      'href',
      '/pl/contact/',
    );
  });
});

test.describe('long conversations scroll inside the chat', () => {
  const history = Array.from({ length: 14 }, (_, i) => [
    { role: 'user', text: `Question ${i}?` },
    { role: 'assistant', text: 'Piotr builds things with React and Expo. '.repeat(4) },
  ]).flat();

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((turns) => localStorage.setItem('byte:conversation', JSON.stringify(turns)), history);
  });

  const measure = (page: Page) =>
    page.evaluate(() => {
      const log = [...document.querySelectorAll<HTMLElement>('[data-byte-log]')].find((el) => el.offsetParent);
      return {
        pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
        logScrolls: log ? log.scrollHeight > log.clientHeight : false,
      };
    });

  test('the home bento still fits one desktop screen, collapsed and expanded', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop layout only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    expect(await measure(page)).toEqual({ pageScrolls: false, logScrolls: true });
    await page.getByRole('button', { name: 'Expand chat' }).click();
    await expect(page.getByRole('heading', { name: "Hi, I'm Piotr." })).toBeHidden();
    expect(await measure(page)).toEqual({ pageScrolls: false, logScrolls: true });
  });

  test('on phones the tile and the expanded chat keep a fixed size', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only');
    await page.goto('/');
    const tile = page.locator('[data-chat]');
    expect((await tile.boundingBox())?.height).toBeLessThan(700);
    expect((await measure(page)).logScrolls).toBe(true);
    await page.getByRole('button', { name: 'Expand chat' }).click();
    await expect(page.getByRole('heading', { name: "Hi, I'm Piotr." })).toBeHidden();
    const viewport = page.viewportSize()?.height ?? 0;
    expect((await tile.boundingBox())?.height).toBeLessThanOrEqual(viewport + 1);
    expect((await measure(page)).logScrolls).toBe(true);
  });

  test('the floating chat scrolls inside the dialog', async ({ page }) => {
    await page.goto('/projects/');
    await page.getByRole('button', { name: 'Ask Byte' }).click();
    const dialog = await page.getByRole('dialog').boundingBox();
    // Full screen on phones: allow sub-pixel rounding.
    expect(dialog?.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
    expect((await measure(page)).logScrolls).toBe(true);
  });
});

test.describe('floating chat on other pages', () => {
  test('opens as a dialog, shares the conversation, and closes with Esc', async ({ page }) => {
    const bodies = await mockByte(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Ask Byte' })).toHaveCount(0);

    await page.goto('/projects/');
    const open = page.getByRole('button', { name: 'Ask Byte' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Ask Byte' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /Ask Byte a question/ })).toBeFocused();

    await dialog.getByRole('button', { name: 'Open to internships?' }).click();
    await expect(dialog.getByRole('link', { name: 'the case study' })).toBeVisible();
    expect(bodies).toHaveLength(1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    // The same conversation shows up on the home page.
    await page.goto('/');
    await expect(page.getByRole('log').getByText('Open to internships?')).toBeAttached();
  });

  test('closes with its close button', async ({ page }) => {
    await page.goto('/blog/');
    await page.getByRole('button', { name: 'Ask Byte' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close chat' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('speaks Polish on Polish pages', async ({ page }) => {
    const bodies = await mockByte(page);
    await page.goto('/pl/blog/');
    await page.getByRole('button', { name: "Zapytaj Byte'a" }).click();
    const dialog = page.getByRole('dialog', { name: "Zapytaj Byte'a" });
    await dialog.getByRole('textbox', { name: "Zadaj Byte'owi pytanie o Piotra" }).fill('Cześć!');
    await dialog.getByRole('button', { name: 'Wyślij pytanie' }).click();
    await expect(dialog.getByText('Sprawdzam na GitHubie: reclaim')).toBeVisible();
    expect(bodies[0]?.locale).toBe('pl');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the open dialog has no axe violations in ${theme} mode`, async ({ page }) => {
      await mockByte(page);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/about/');
      await page.getByRole('button', { name: 'Ask Byte' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'What has he built?' }).click();
      await expect(page.getByRole('dialog').getByRole('link', { name: 'the case study' })).toBeVisible();
      expect((await axe(page)).violations).toEqual([]);
    });
  }
});
