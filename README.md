# Piotr Płotast: personal page

My portfolio, blog and an AI agent ("Byte") that answers questions about me. Built to be fast and accessible: the
targets are **Lighthouse 100 for accessibility, 95+ for everything else** and **WCAG 2.2 AA**, enforced in CI.

## Stack

| Area      | Choice                                                                      |
| --------- | --------------------------------------------------------------------------- |
| Framework | [Astro 7](https://astro.build) (static output + Vercel adapter for the API) |
| Styling   | Tailwind CSS 4, design tokens in `src/styles/global.css`                    |
| Fonts     | Bricolage Grotesque + DM Sans, self-hosted through Astro's fonts API        |
| Language  | TypeScript (strictest)                                                      |
| Quality   | ESLint (+ jsx-a11y rules), Prettier, lefthook git hooks                     |
| Tests     | Vitest (unit), Playwright + axe-core (e2e & accessibility), Lighthouse CI   |
| Hosting   | Vercel                                                                      |

## Getting started

Requires Node 22.22+ and pnpm 10 (`corepack enable` sets pnpm up from `package.json`).

```sh
pnpm install
pnpm dev        # http://localhost:4321
```

## Scripts

| Command         | What it does                                                             |
| --------------- | ------------------------------------------------------------------------ |
| `pnpm dev`      | Dev server with hot reload                                               |
| `pnpm build`    | Production build into `.vercel/output`                                   |
| `pnpm lint`     | ESLint, including accessibility rules for `.astro` templates             |
| `pnpm format`   | Prettier (also sorts Tailwind classes)                                   |
| `pnpm check`    | Astro + TypeScript type check                                            |
| `pnpm test`     | Unit tests (Vitest)                                                      |
| `pnpm test:e2e` | Playwright e2e + axe accessibility tests against the build (build first) |
| `pnpm lhci`     | Lighthouse CI with score budgets (build first)                           |
| `pnpm verify`   | Everything above except Lighthouse, in the order CI runs it              |

Git hooks (lefthook): **pre-commit** formats and lints staged files, **pre-push** runs the type check and unit tests.

## Project structure

```
src/
  content/           All site content, one folder per language (see "Editing content")
  content.config.ts  Schemas for the content, checked at build time
  components/        Header, Footer, language switcher, theme toggle, home tiles, page bodies
  i18n/              Locales, URL helpers and the interface dictionary (EN + PL)
  layouts/           BaseLayout: <head>, hreflang, fonts, theme bootstrapping, skip link
  lib/               Content loading with English fallback, small tested utilities
  pages/             Routes: English at /, Polish under /pl/
  styles/            Tailwind entry + design tokens (light/dark)
tests/e2e/           Playwright specs (a11y in both themes and languages, chat, layout, i18n)
```

## Editing content

Everything on the site comes from files in `src/content/`, so changing text never means touching code. Each
collection has an `en/` and a `pl/` folder; a file with the same name in both is the same item in two languages.
If a Polish file is missing, the English one is shown instead.

| What                | Where                                       | Notes                                                |
| ------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Bio, skills, Byte   | `src/content/profile/en.yaml`, `pl.yaml`    | Availability, socials, the agent's greeting          |
| Projects            | `src/content/projects/<lang>/<slug>.md`     | `featured: true` puts one on the home page           |
| Blog posts          | `src/content/posts/<lang>/<slug>.md(x)`     | `draft: true` hides a post outside `pnpm dev`        |
| Experience          | `src/content/experience/<lang>/<slug>.yaml` | School, jobs, courses, hackathons                    |
| CV                  | `public/cv.pdf`                             | A "Download CV" button appears on About when present |
| Social preview      | `scripts/generate-og.mjs` → `pnpm og`       | Regenerates `public/og/default.png`                  |
| Buttons, menus, etc | `src/i18n/ui.ts`                            | Polish must define every key (type-checked)          |

Fields are validated when the site builds: a typo or missing required field fails `pnpm build` with a message
pointing at the file. Anything marked `TODO(content)` is waiting for real information and stays hidden until filled
in.

## Accessibility

- Every page is scanned with axe (WCAG 2.2 AA + best practices) in light and dark mode, on desktop and mobile.
- Lighthouse CI fails the build if accessibility drops below 100 or any other category below 95.
- Colour tokens are chosen so every text/background pair is at least 4.5:1 in both themes; lime is only used as a
  fill behind dark text.
- Skip link, visible focus rings, 44px touch targets, `prefers-reduced-motion` respected, theme follows the OS until
  you pick one.

## Roadmap

- [x] **Phase 0:** design mockups
- [x] **Phase 1:** project setup, design tokens, home page, CI
- [x] **Phase 2:** content collections (projects, posts, experience), English + Polish
- [x] **Phase 3:** projects with case studies, blog (MDX, tags, RSS, search), About + CV, SEO
- [ ] **Phase 4:** Byte, the AI agent (Claude API, tool use, streaming, rate limiting, Turnstile)
- [ ] **Phase 5:** contact form (Resend + Turnstile)
- [ ] **Phase 6:** launch on Vercel with a custom domain and analytics

## Deployment

The site deploys to Vercel. Set `SITE_URL` to the production URL (used for canonical links and the sitemap) once the
custom domain is set up.
