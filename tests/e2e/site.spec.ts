import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = ['/', '/projects', '/blog', '/about', '/contact', '/404'];

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
    await expect(page.getByRole('heading', { level: 1, name: "Hi, I'm Piotr." })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask Byte' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Ask Byte a question/ })).toBeDisabled();

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
  for (const viewport of viewports) {
    test(`no scrolling at ${viewport.width}×${viewport.height}`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'Desktop layout only; on phones the tiles stack and scroll');
      await page.setViewportSize(viewport);
      await page.goto('/');
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
