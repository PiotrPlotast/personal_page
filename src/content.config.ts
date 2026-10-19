import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/*
 * All content lives in per-locale folders: `src/content/<collection>/<locale>/<slug>.<ext>`.
 * Entry ids are therefore `<locale>/<slug>`; see `src/lib/content.ts` for the lookup with
 * English fallback. The AI agent (phase 4) reads these same collections.
 */

const url = z.url();

const projects = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      /** "Mobile app", "Web app", … */
      kind: z.string(),
      /** One or two sentences for cards and the agent. */
      summary: z.string().max(200),
      stack: z.array(z.string()).min(1),
      repo: url,
      demo: url.optional(),
      featured: z.boolean().default(false),
      /** Lower comes first. */
      order: z.number().int().default(100),
      status: z.enum(['active', 'finished', 'archived']).default('finished'),
      screenshots: z.array(z.object({ src: image(), alt: z.string().min(1) })).default([]),
    }),
});

const posts = defineCollection({
  loader: glob({ pattern: '*/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().max(200),
      published: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      cover: z.object({ src: image(), alt: z.string().min(1) }).optional(),
    }),
});

const yearMonth = z.string().regex(/^\d{4}(-\d{2})?$/, 'Use YYYY or YYYY-MM');

const experience = defineCollection({
  loader: glob({ pattern: '*/*.{yaml,yml}', base: './src/content/experience' }),
  schema: z.object({
    type: z.enum(['education', 'work', 'course', 'hackathon', 'volunteering']),
    title: z.string(),
    organization: z.string(),
    start: yearMonth,
    /** Leave out while it's ongoing. */
    end: yearMonth.optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    link: url.optional(),
    draft: z.boolean().default(false),
  }),
});

const profile = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: './src/content/profile' }),
  schema: z.object({
    name: z.string(),
    firstName: z.string(),
    nickname: z.string().optional(),
    shortName: z.string(),
    role: z.string(),
    location: z.string(),
    timezone: z.string(),
    school: z.string().optional(),
    availability: z.object({ open: z.boolean(), label: z.string() }),
    tagline: z.string(),
    about: z.string(),
    skills: z.array(z.string()).min(1),
    now: z.array(z.string()).default([]),
    email: z.email().optional(),
    socials: z.array(z.object({ label: z.string(), href: url })).default([]),
    agent: z.object({
      name: z.string(),
      tagline: z.string(),
      greeting: z.string(),
      suggestions: z.array(z.string()).min(1).max(4),
      /** Placeholder answer until the real agent ships. */
      reply: z.string(),
    }),
  }),
});

export const collections = { projects, posts, experience, profile };
