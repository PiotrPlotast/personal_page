// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// TODO: switch to the custom domain once it's bought (see README → Deployment).
const site = process.env.SITE_URL ?? 'https://piotrplotast.vercel.app';

// Latin + Latin Extended covers English and Polish (ą, ć, ę, ł, ń, ó, ś, ź, ż).
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

// Self-hosted variable fonts from @fontsource-variable, served through Astro's fonts API.
const BRICOLAGE = '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque';
const DM_SANS = '@fontsource-variable/dm-sans/files/dm-sans';

export default defineConfig({
  site,
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'ignore',
  // English lives at `/`, Polish under `/pl/`. Helpers for this are in src/i18n/config.ts.
  i18n: {
    locales: ['en', 'pl'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  markdown: {
    // Dual themes: colours switch with the site theme via CSS (see .astro-code in global.css).
    // High-contrast variants keep every token at WCAG AA against the code background.
    shikiConfig: {
      themes: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
      defaultColor: false,
    },
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en', pl: 'pl' } },
      filter: (page) => !page.endsWith('/404/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Bricolage Grotesque',
      cssVariable: '--font-bricolage',
      fallbacks: ['system-ui', 'sans-serif'],
      options: {
        variants: [
          { src: [`${BRICOLAGE}-latin-wght-normal.woff2`], weight: '200 800', style: 'normal', unicodeRange: [LATIN] },
          {
            src: [`${BRICOLAGE}-latin-ext-wght-normal.woff2`],
            weight: '200 800',
            style: 'normal',
            unicodeRange: [LATIN_EXT],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'DM Sans',
      cssVariable: '--font-dm-sans',
      fallbacks: ['system-ui', 'sans-serif'],
      options: {
        variants: [
          { src: [`${DM_SANS}-latin-wght-normal.woff2`], weight: '100 1000', style: 'normal', unicodeRange: [LATIN] },
          {
            src: [`${DM_SANS}-latin-ext-wght-normal.woff2`],
            weight: '100 1000',
            style: 'normal',
            unicodeRange: [LATIN_EXT],
          },
        ],
      },
    },
  ],
});
