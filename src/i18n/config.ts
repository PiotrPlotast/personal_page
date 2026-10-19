export const locales = ['en', 'pl'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** Language names shown in the switcher, always in their own language. */
export const localeNames: Record<Locale, string> = { en: 'English', pl: 'Polski' };

/** BCP 47 tags for <html lang>, hreflang and og:locale. */
export const localeTags: Record<Locale, { lang: string; og: string }> = {
  en: { lang: 'en', og: 'en_GB' },
  pl: { lang: 'pl', og: 'pl_PL' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** The locale a path belongs to: `/pl/...` is Polish, everything else is the default (English). */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/')[1];
  return isLocale(first) && first !== defaultLocale ? first : defaultLocale;
}

/** A path with any locale prefix removed, e.g. `/pl/projects/` → `/projects/`. */
export function stripLocale(pathname: string): string {
  const locale = localeFromPath(pathname);
  if (locale === defaultLocale) return pathname || '/';
  const rest = pathname.slice(locale.length + 1);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** The same page in another locale. English keeps unprefixed URLs; other locales get `/<locale>`. */
export function localizePath(pathname: string, locale: Locale): string {
  const base = stripLocale(pathname);
  if (locale === defaultLocale) return base;
  return base === '/' ? `/${locale}/` : `/${locale}${base}`;
}
