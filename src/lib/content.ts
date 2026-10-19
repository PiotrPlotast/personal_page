import { getCollection, getEntry } from 'astro:content';
import { defaultLocale, type Locale } from '~/i18n/config';
import { pickLocalized } from './localized';

export async function getProfile(locale: Locale) {
  const entry = (await getEntry('profile', locale)) ?? (await getEntry('profile', defaultLocale));
  if (!entry) throw new Error('Missing src/content/profile/en.yaml');
  return entry.data;
}

/** Projects in the given locale (English fallback), featured first, then by `order`. */
export async function getProjects(locale: Locale) {
  const projects = pickLocalized(await getCollection('projects'), locale);
  return projects.sort((a, b) => Number(b.data.featured) - Number(a.data.featured) || a.data.order - b.data.order);
}

/** Published posts (drafts only show in `astro dev`), newest first. */
export async function getPosts(locale: Locale) {
  const posts = pickLocalized(await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft), locale);
  return posts.sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());
}

/** Experience entries (drafts hidden), most recent first. */
export async function getExperience(locale: Locale) {
  const items = pickLocalized(await getCollection('experience', ({ data }) => !data.draft), locale);
  return items.sort((a, b) => b.data.start.localeCompare(a.data.start));
}
