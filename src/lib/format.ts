import { localeTags, type Locale } from '~/i18n/config';

/** "19 October 2026" / "19 października 2026". */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTags[locale].intl, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** Machine-readable date for <time datetime>. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const WORDS_PER_MINUTE = 200;

/** Whole minutes to read a Markdown/MDX body (code, markup and URLs excluded), at least 1. */
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/<!--[\s\S]*?-->/g, ' ') // comments
    .replace(/<[^>]+>/g, ' ') // JSX/HTML tags
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images keep their text
    .replace(/[#>*_`~|-]+/g, ' ');
  const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** URL-safe tag slug: "Next.js & React" → "next-js-react", "Dostępność" → "dostepnosc". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
