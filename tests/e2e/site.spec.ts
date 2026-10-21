import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pages = [
  '/',
  '/projects',
  '/projects/accountability-buddies',
  '/blog',
  '/blog/how-i-built-this-site',
  '/blog/tags/astro',
  '/about',
  '/contact',
  '/404',
  '/pl/',
  '/pl/projects',
  '/pl/projects/simsify-life',
  '/pl/blog',
  '/pl/blog/how-i-built-this-site',
  '/pl/about',
];

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

  test('re-opening right after closing works and throws no errors', async ({ page }) => {
    // Regression: cleanup of the closing fade used to cancel the next opening animation.
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    for (let round = 0; round < 3; round++) {
      await input(page).click();
      await expect(hero(page)).toBeHidden();
      await page.keyboard.press('Escape');
      await expect(hero(page)).toBeVisible();
      await page.getByRole('button', { name: 'Expand chat' }).click();
      await expect(hero(page)).toBeHidden();
      await page.getByRole('button', { name: 'Close full chat' }).click();
      await expect(hero(page)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('keyboard focus alone does not expand it, typing does', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is checked on desktop');
    await page.goto('/');
    await input(page).focus();
    await expect(hero(page)).toBeVisible();
    await page.keyboard.type('Hi');
    await expect(hero(page)).toBeHidden();
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
      await page.route('**/api/chat', (route) =>
        route.fulfill({
          headers: { 'content-type': 'text/event-stream' },
          body: 'data: {"type":"text","text":"He builds **apps**."}\n\ndata: {"type":"done"}\n\n',
        }),
      );
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/');
      await page.getByRole('button', { name: "What's his stack?" }).click();
      await expect(page.getByRole('log').getByText('apps')).toBeVisible();
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
    await page.route('**/api/chat', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.goto('/pl/');
    await page.getByRole('button', { name: 'Co zbudował?' }).click();
    const log = page.getByRole('log', { name: "Rozmowa z Byte'em" });
    await expect(log.getByText('Co zbudował?')).toBeVisible();
    await expect(log.getByText(/Jestem teraz offline/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zamknij pełny czat' })).toBeVisible();
  });
});

test.describe('projects', () => {
  test('the index links to a case study with code and navigation', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(page.locator('main article')).toHaveCount(5);

    await page.getByRole('link', { name: 'Simsify Life' }).click();
    await expect(page).toHaveURL(/\/projects\/simsify-life\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Simsify Life' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View code' })).toHaveAttribute(
      'href',
      /github\.com\/PiotrPlotast\/simsify-life/,
    );
    // Still inside the Projects section.
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }),
    ).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: /Previous project/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Accountability Buddies' })).toBeVisible();
  });

  test('case studies are translated', async ({ page }) => {
    await page.goto('/pl/projects/dictionary-web-app');
    await expect(page.getByRole('heading', { level: 1, name: 'Słownik' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zobacz kod' })).toBeVisible();
  });
});

test.describe('blog', () => {
  test('a post shows its date, reading time, table of contents and tags', async ({ page }) => {
    await page.goto('/blog');
    await page.getByRole('link', { name: 'How I built this site' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'How I built this site' })).toBeVisible();
    await expect(page.locator('time').first()).toHaveAttribute('datetime', '2026-10-19');
    await expect(page.getByText(/\d+ min read/)).toBeVisible();

    const toc = page.getByRole('navigation', { name: 'On this page' });
    await toc.getByRole('link', { name: 'A bug only CI could see' }).click();
    await expect(page).toHaveURL(/#a-bug-only-ci-could-see$/);

    await page.getByRole('link', { name: '#Astro' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Posts tagged “Astro”' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'How I built this site' })).toBeVisible();
  });

  test('code blocks have a working copy button', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/blog/how-i-built-this-site');
    const copy = page.getByRole('button', { name: 'Copy code' }).first();
    await copy.click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('export function insetClip');
  });

  test('search finds posts', async ({ page }) => {
    await page.goto('/blog');
    const search = page.getByRole('searchbox', { name: 'Search posts' });
    await expect(search).toBeVisible();
    await search.fill('clip-path');
    await expect(page.getByRole('status')).toHaveText(/1 result/);
    await expect(
      page.locator('[data-search-results]').getByRole('link', { name: 'How I built this site' }),
    ).toBeVisible();

    await search.fill('kubernetes');
    await expect(page.getByRole('status')).toHaveText('No posts match “kubernetes”.');
  });

  test('untranslated posts fall back to English with a note', async ({ page }) => {
    await page.goto('/pl/blog/how-i-built-this-site');
    await expect(page.getByRole('note')).toContainText('nie jest jeszcze dostępna po polsku');
    await expect(page.locator('article[lang="en"]')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Wszystkie wpisy' })).toBeVisible();
  });

  test('RSS feeds list posts in each language', async ({ request }) => {
    const en = await request.get('/rss.xml');
    expect(en.ok()).toBe(true);
    const enXml = await en.text();
    expect(enXml).toContain('<title>How I built this site</title>');
    expect(enXml).toContain('<language>en-GB</language>');

    const pl = await (await request.get('/pl/rss.xml')).text();
    expect(pl).toContain('<language>pl-PL</language>');
    expect(pl).toContain('/pl/blog/how-i-built-this-site/');
  });
});

test.describe('about', () => {
  test('shows the bio, now, skills and links', async ({ page }) => {
    await page.goto('/about');
    for (const name of ['Who I am', 'Experience & education', 'Now', 'Skills', 'Elsewhere']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.getByRole('region', { name: 'Elsewhere' }).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/PiotrPlotast',
    );
    // No CV uploaded yet, so no download button.
    await expect(page.getByRole('link', { name: /Download CV/ })).toHaveCount(0);
  });
});

test.describe('SEO metadata', () => {
  test('posts have article metadata and BlogPosting structured data', async ({ page }) => {
    await page.goto('/blog/how-i-built-this-site');
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\/default\.png$/);
    const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
    expect(data['@type']).toBe('BlogPosting');
    expect(data.headline).toBe('How I built this site');
    expect(data.author.name).toBe('Piotr Płotast');
  });

  test('the home page describes the person', async ({ page }) => {
    await page.goto('/');
    const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
    expect(data['@type']).toBe('Person');
    expect(data.sameAs).toContain('https://github.com/PiotrPlotast');
  });
});
