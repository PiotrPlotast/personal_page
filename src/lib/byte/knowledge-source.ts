import { localizePath, type Locale } from '~/i18n/config';
import { useTranslations } from '~/i18n/ui';
import { getExperience, getPosts, getProfile, getProjects } from '~/lib/content';
import { isoDate } from '~/lib/format';
import { cleanDoc, type Knowledge } from './knowledge';

const cache = new Map<Locale, Promise<Knowledge>>();

/** Byte's knowledge for one language, read from the same content collections as the pages. */
export function loadKnowledge(locale: Locale): Promise<Knowledge> {
  let knowledge = cache.get(locale);
  if (!knowledge) {
    knowledge = build(locale);
    // Content only changes on deploy, so one build per server instance is enough.
    cache.set(locale, knowledge);
    knowledge.catch(() => cache.delete(locale));
  }
  return knowledge;
}

async function build(locale: Locale): Promise<Knowledge> {
  const t = useTranslations(locale);
  const [profile, projects, posts, experience] = await Promise.all([
    getProfile(locale),
    getProjects(locale),
    getPosts(locale),
    getExperience(locale),
  ]);

  return {
    locale,
    profile: {
      name: profile.name,
      firstName: profile.firstName,
      nickname: profile.nickname,
      pronouns: profile.pronouns,
      role: profile.role,
      location: profile.location,
      timezone: profile.timezone,
      school: profile.school,
      availability: profile.availability,
      tagline: profile.tagline,
      about: profile.about,
      skills: profile.skills,
      now: profile.now,
      email: profile.email,
      socials: profile.socials,
    },
    agentName: profile.agent.name,
    pages: [
      { key: 'home', label: 'Home', path: localizePath('/', locale) },
      { key: 'projects', label: t('nav.projects'), path: localizePath('/projects/', locale) },
      { key: 'blog', label: t('nav.blog'), path: localizePath('/blog/', locale) },
      { key: 'about', label: t('nav.about'), path: localizePath('/about/', locale) },
      { key: 'contact', label: t('nav.contact'), path: localizePath('/contact/', locale) },
    ],
    projects: projects.map(({ slug, data, body }) => ({
      slug,
      name: data.name,
      kind: data.kind,
      status: data.status,
      summary: data.summary,
      stack: data.stack,
      repo: data.repo,
      demo: data.demo,
      path: localizePath(`/projects/${slug}/`, locale),
      writeup: cleanDoc(body ?? ''),
    })),
    posts: posts.map(({ slug, data, body }) => ({
      slug,
      title: data.title,
      description: data.description,
      published: isoDate(data.published),
      tags: data.tags,
      path: localizePath(`/blog/${slug}/`, locale),
      body: cleanDoc(body ?? ''),
    })),
    experience: experience.map(({ data }) => ({
      type: data.type,
      title: data.title,
      organization: data.organization,
      start: data.start,
      end: data.end,
      location: data.location,
      description: data.description,
    })),
  };
}
