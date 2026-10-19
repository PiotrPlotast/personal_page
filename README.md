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
  components/      Header, Footer, ThemeToggle, home page tiles
  data/profile.ts  Site content for now (moves to content collections in phase 2)
  layouts/         BaseLayout: <head>, fonts, theme bootstrapping, skip link
  lib/             Small tested utilities (theme resolution)
  pages/           Routes
  styles/          Tailwind entry + design tokens (light/dark)
tests/e2e/         Playwright specs (a11y in both themes, theme toggle, navigation)
```

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
- [ ] **Phase 2:** content collections (projects, posts, experience), English + Polish
- [ ] **Phase 3:** projects with case studies, blog (MDX, tags, RSS, search), About + CV, SEO
- [ ] **Phase 4:** Byte, the AI agent (Claude API, tool use, streaming, rate limiting, Turnstile)
- [ ] **Phase 5:** contact form (Resend + Turnstile)
- [ ] **Phase 6:** launch on Vercel with a custom domain and analytics

## Deployment

The site deploys to Vercel. Set `SITE_URL` to the production URL (used for canonical links and the sitemap) once the
custom domain is set up.
