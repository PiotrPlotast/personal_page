import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pages = ['/', '/projects', '/blog', '/about', '/contact', '/404', '/pl/', '/pl/projects', '/pl/about'];

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const path of pages) {
      test(`${path} has no violations in ${theme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }
});

test.describe('home page', () => {
  test('renders the hero, chat preview and navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Piotr Płotast/);
    await expect(page.getByRole('heading', { level: 1, name: /Piotr Płotast/ })).toBeAttached();
    await expect(page.getByRole('heading', { name: "Hi, I'm Piotr." })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask Byte' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Ask Byte a question/ })).toBeEditable();

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('has exactly one h1 and a working skip link', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is checked on desktop');
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });
});

test.describe('home bento fits one screen on desktop', () => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1536, height: 730 },
    { width: 1440, height: 900 },
    { width: 1366, height: 657 },
    { width: 1280, height: 720 },
  ];
  for (const [path, viewport] of [
    ...viewports.map((v) => ['/', v] as const),
    // Polish strings run longer; check the tightest sizes too.
    ['/pl/', { width: 1440, height: 900 }] as const,
    ['/pl/', { width: 1366, height: 657 }] as const,
  ]) {
    test(`${path}: no scrolling at ${viewport.width}×${viewport.height}`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'Desktop layout only; on phones the tiles stack and scroll');
      await page.setViewportSize(viewport);
      await page.goto(path);
      const { scrollHeight, innerHeight } = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      }));
      expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
      // Nothing may be clipped inside a tile either.
      const clipped = await page
        .locator('main section')
        .evaluateAll((tiles) => tiles.filter((tile) => tile.scrollHeight > tile.clientHeight + 1).length);
      expect(clipped).toBe(0);
    });
  }
});

test.describe('chat expands over the bento', () => {
  const hero = (page: Page) => page.getByRole('heading', { name: "Hi, I'm Piotr." });
  const input = (page: Page) => page.getByRole('textbox', { name: /Ask Byte a question/ });

  test('clicking the input expands it; Esc and the close button shrink it back', async ({ page }) => {
    await page.goto('/');
    await input(page).click();
    await expect(hero(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Close full chat' })).toHaveAttribute('aria-expanded', 'true');
    await expect(input(page)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(hero(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand chat' })).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Expand chat' }).click();
    await expect(hero(page)).toBeHidden();
    await expect(input(page)).toBeFocused();
    const close = page.getByRole('button', { name: 'Close full chat' });
    await close.click();
    await expect(hero(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand chat' })).toBeFocused();
  });

  test('keyboard focus alone does not expand it, typing does', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is checked on desktop');
    await page.goto('/');
    await input(page).focus();
    await expect(hero(page)).toBeVisible();
    await page.keyboard.type('Hi');
    await expect(hero(page)).toBeHidden();
  });

  test('asking a question shows it with a placeholder reply', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'What has he built?' }).click();
    const log = page.getByRole('log', { name: 'Conversation with Byte' });
    await expect(log.getByText('What has he built?')).toBeVisible();
    await expect(log.getByText(/still in training/).last()).toBeVisible();

    await input(page).fill('Where does he study?');
    await input(page).press('Enter');
    await expect(log.getByText('Where does he study?')).toBeVisible();
    await expect(input(page)).toHaveValue('');
  });

  test('the expanded chat still fits one desktop screen', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop layout only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await input(page).click();
    await expect(hero(page)).toBeHidden();
    const chat = await page.locator('[data-chat]').boundingBox();
    const bento = await page.locator('[data-bento]').boundingBox();
    expect(chat).toEqual(bento);
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scrolls).toBe(false);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`expanded chat has no axe violations in ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/');
      await page.getByRole('button', { name: "What's his stack?" }).click();
      await expect(
        page
          .getByRole('log')
          .getByText(/still in training/)
          .last(),
      ).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('theme toggle', () => {
  test('follows the system theme by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  });

  test('switches theme and remembers the choice across pages', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();

    await page.goto('/about');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('English and Polish', () => {
  test('Polish pages are marked as Polish and translated', async ({ page }) => {
    await page.goto('/pl/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByRole('heading', { name: 'Cześć, jestem Piotr.' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Główna' }).getByRole('link', { name: 'Projekty' }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: "Zadaj Byte'owi pytanie o Piotra" })).toBeVisible();
    await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('aria-label', /motyw/);
  });

  test('the switcher keeps you on the same page', async ({ page }) => {
    await page.goto('/projects');
    const languages = page.getByRole('navigation', { name: 'Language' });
    await expect(languages.getByRole('link', { name: /EN English/ })).toHaveAttribute('aria-current', 'true');
    await languages.getByRole('link', { name: /PL Polski/ }).click();
    await expect(page).toHaveURL(/\/pl\/projects\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

    await page
      .getByRole('navigation', { name: 'Język' })
      .getByRole('link', { name: /EN English/ })
      .click();
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('pages link to their translation for search engines', async ({ page }) => {
    await page.goto('/pl/about');
    const alternates = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((links) =>
        links.map((l) => [
          l.getAttribute('hreflang'),
          new URL(l.getAttribute('href') ?? '').pathname.replace(/\/$/, ''),
        ]),
      );
    expect(alternates).toEqual([
      ['en', '/about'],
      ['pl', '/pl/about'],
      ['x-default', '/about'],
    ]);
  });

  test('the chat works in Polish', async ({ page }) => {
    await page.goto('/pl/');
    await page.getByRole('button', { name: 'Co zbudował?' }).click();
    const log = page.getByRole('log', { name: "Rozmowa z Byte'em" });
    await expect(log.getByText(/Wciąż się uczę, więc/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zamknij pełny czat' })).toBeVisible();
  });
});
