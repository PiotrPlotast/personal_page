# Piotr Płotast: personal page

My portfolio, blog and an AI agent ("Byte") that answers questions about me. Built to be fast and accessible: the
targets are **Lighthouse 100 for accessibility, 95+ for everything else** and **WCAG 2.2 AA**, enforced in CI.

## Stack

| Area      | Choice                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| Framework | [Astro 7](https://astro.build) (static output + Vercel adapter for the API)  |
| Styling   | Tailwind CSS 4, design tokens in `src/styles/global.css`                     |
| Fonts     | Bricolage Grotesque + DM Sans, self-hosted through Astro's fonts API         |
| Language  | TypeScript (strictest)                                                       |
| Quality   | ESLint (+ jsx-a11y rules), Prettier, lefthook git hooks                      |
| Tests     | Vitest (unit), Playwright + axe-core (e2e & accessibility), Lighthouse CI    |
| AI agent  | Claude via OpenRouter (Anthropic SDK), Upstash Redis, Cloudflare Turnstile   |
| Analytics | Vercel Web Analytics (cookie-free) and Speed Insights (real-user Web Vitals) |
| Hosting   | Vercel                                                                       |

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
  lib/byte/          Byte: prompt, tools, streaming loop, limits and budget (all unit-tested)
  pages/             Routes: English at /, Polish under /pl/, Byte's endpoint at /api/chat
  scripts/           Browser code for the chat
  styles/            Tailwind entry + design tokens (light/dark)
tests/e2e/           Playwright specs (a11y in both themes and languages, chat, layout, i18n)
                     The chat specs use a fake /api/chat, so CI never calls Claude
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

## Byte, the AI agent

Byte answers visitors' questions about me, in the home page tile and in the "Ask Byte" button on every other page.

- **What it knows:** my profile, project list, posts and experience from `src/content/` go into its instructions. When
  a question needs more, it looks things up with tools: a project's case study, a post's full text, or my public
  GitHub (repos, READMEs, recent commits). The chat shows each lookup.
- **How it answers:** `/api/chat` (a Vercel function) streams the reply from Claude, through
  [OpenRouter](https://openrouter.ai), as it's written. The conversation is kept in the visitor's browser
  (`localStorage`) and sent along with each question.
- **Protection:** in order, every question goes through a same-site check, a per-visitor rate limit (10 per 10 minutes,
  60 a day), Cloudflare Turnstile (an invisible bot check, once per visit), and the spending budget ($5 a month, at
  most $0.50 a day). When the budget is used up Byte says it's out of coffee and points to the contact page.
- **Settings** (model, effort, budget, rate limits, input limits) are in `src/lib/byte/config.ts`. Its personality and
  rules are in `src/lib/byte/knowledge.ts`.

### Configuration

Set these in Vercel (Project → Settings → Environment Variables), or in a local `.env` file for `pnpm dev` (see
`.env.example`). All are optional: without an API key Byte simply says it's offline.

| Variable                                             | What for                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                                 | OpenRouter API key (openrouter.ai/keys). Give the key a credit limit: that's the hard cap |
| `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`  | Cloudflare Turnstile widget keys. Without them the bot check is skipped                   |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared store for rate limits, the budget and the GitHub cache. Added by the Upstash       |
| (or `KV_REST_API_URL`, `KV_REST_API_TOKEN`)          | integration in the Vercel Marketplace. Without it each server instance counts on its own  |
| `GITHUB_TOKEN`                                       | Optional read-only token; raises GitHub's API limit from 60 to 5,000 requests an hour     |

## Contact form

`/contact/` sends the message to my inbox through [Resend](https://resend.com); replying to that email answers the
sender directly. The browser checks the fields first and the server checks them again with the same rules
(`src/lib/contact/form.ts`). `/api/contact` then runs a same-site check, a hidden honeypot field, a per-visitor rate
limit (3 per 10 minutes, 10 a day) and the same Turnstile check as Byte before sending.

| Variable             | What for                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`     | Resend API key (resend.com/api-keys). Without it, or without `CONTACT_TO_EMAIL`, the form says |
| `CONTACT_TO_EMAIL`   | it isn't working and points to the other ways to get in touch. Where messages go               |
| `CONTACT_FROM_EMAIL` | Sender, e.g. `Portfolio <contact@yourdomain.com>` once a domain is verified in Resend. Default |
|                      | `onboarding@resend.dev` only delivers to the Resend account's own email                        |

The Turnstile and Upstash variables above protect the form too.

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
- [x] **Phase 4:** Byte, the AI agent (Claude via OpenRouter, tool use, streaming, rate limiting, Turnstile)
- [x] **Phase 5:** contact form (Resend + Turnstile)
- [ ] **Phase 6:** launch on Vercel with a custom domain and analytics

## Deployment

Pushes to `main` deploy to production on Vercel (https://piotrplotast.vercel.app), and every pull request gets a preview
URL. `vercel.json` makes Vercel run the full `pnpm build`, so the search index is built too.

Analytics and Speed Insights are only included in Vercel builds (`VERCEL` is set there), because their scripts are
served by Vercel itself. Turn them on once per project under **Analytics** and **Speed Insights** in the Vercel
dashboard.

Once a custom domain is set up, set `SITE_URL` to it (used for canonical links and the sitemap).
