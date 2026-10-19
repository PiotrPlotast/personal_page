import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { localeTags, localizePath, type Locale } from '~/i18n/config';
import { useTranslations } from '~/i18n/ui';
import { getPosts, getProfile } from './content';

/** RSS feed of published posts for one language (falls back to English posts, like the blog). */
export async function feed(context: APIContext, locale: Locale) {
  const t = useTranslations(locale);
  const [posts, profile] = await Promise.all([getPosts(locale), getProfile(locale)]);
  return rss({
    title: `${profile.name} · ${t('page.blog')}`,
    description: t('blog.intro'),
    site: context.site ?? 'http://localhost:4321',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.published,
      categories: post.data.tags,
      link: localizePath(`/blog/${post.slug}/`, locale),
    })),
    customData: `<language>${localeTags[locale].intl}</language>`,
  });
}
