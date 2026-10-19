import { defaultLocale, isLocale, type Locale } from '~/i18n/config';

export interface LocalizedMeta {
  /** Id without the locale folder, shared by all translations of an entry. */
  slug: string;
  /** Locale of the entry actually returned. */
  locale: Locale;
  /** True when no translation exists and the default-locale entry was used instead. */
  isFallback: boolean;
}

/** Splits a content id like `pl/simsify-life` into its locale folder and slug. */
export function splitId(id: string): { locale: Locale; slug: string } {
  const [first, ...rest] = id.split('/');
  if (!isLocale(first) || rest.length === 0) {
    throw new Error(`Content id "${id}" must start with a locale folder (${defaultLocale}/…)`);
  }
  return { locale: first, slug: rest.join('/') };
}

/**
 * One entry per slug in the requested locale, falling back to the default locale when a
 * translation is missing. Order follows the first appearance of each slug.
 */
export function pickLocalized<T extends { id: string }>(entries: T[], locale: Locale): (T & LocalizedMeta)[] {
  const bySlug = new Map<string, Partial<Record<Locale, T>>>();
  for (const entry of entries) {
    const { locale: entryLocale, slug } = splitId(entry.id);
    const translations = bySlug.get(slug) ?? {};
    translations[entryLocale] = entry;
    bySlug.set(slug, translations);
  }

  const result: (T & LocalizedMeta)[] = [];
  for (const [slug, translations] of bySlug) {
    const own = translations[locale];
    const fallback = translations[defaultLocale];
    const entry = own ?? fallback;
    if (!entry) continue; // Only exists in another non-default locale: not shown here.
    result.push({ ...entry, slug, locale: own ? locale : defaultLocale, isFallback: !own });
  }
  return result;
}
