/**
 * Temporary home for site content. Phase 2 moves this into typed Astro content
 * collections (Markdown/MDX, EN + PL) that the AI agent reads too.
 */

export interface Link {
  label: string;
  href: string;
}

export interface Project {
  name: string;
  kind: string;
  description: string;
  stack: string[];
  repo: string;
}

export const profile = {
  name: 'Piotr Płotast',
  firstName: 'Piotr',
  nickname: 'Pietrell',
  shortName: 'Piotr P.',
  role: 'Frontend developer',
  location: 'Poland',
  timezone: 'CET',
  /** TODO(content): add school name and year, e.g. "Warsaw University of Technology · 2nd year". */
  school: undefined as string | undefined,
  /** TODO(content): add when you're available, e.g. "from Summer 2027". */
  availability: 'Looking for an internship',
  tagline:
    'A frontend developer and student from Poland. I like building beautiful, functional apps, and writing about what I learn along the way.',
  about:
    "My priority is to keep learning and getting better. Right now I'm going deeper into React, and exploring design, UX and backend topics. Always open to new projects and collaborations with other developers.",
  github: 'https://github.com/PiotrPlotast',
  /** TODO(content): add LinkedIn, Discord and email once you share them. */
  socials: [{ label: 'GitHub', href: 'https://github.com/PiotrPlotast' }] satisfies Link[],
  source: 'https://github.com/PiotrPlotast/personal_page',
} as const;

export const agent = {
  name: 'Byte',
  tagline: 'My AI sidekick. Knows my CV better than I do.',
  greeting: "Psst. I'm Byte. Soon you can ask me anything about Piotr. I'll spill everything that's on his CV.",
  suggestions: ['What has he built?', 'Open to internships?', "What's his stack?"],
} as const;

export const featuredProject: Project = {
  name: 'Accountability Buddies',
  kind: 'Mobile app',
  description: 'A mobile app that keeps friends accountable to the goals they set together.',
  stack: ['React Native', 'Expo', 'Supabase', 'TypeScript'],
  repo: 'https://github.com/PiotrPlotast/accountability-buddies',
};

export const projects: Project[] = [
  {
    name: 'Simsify Life',
    kind: 'Desktop app',
    description: 'Tracks the time you spend building real-life skills.',
    stack: ['Electron', 'TypeScript'],
    repo: 'https://github.com/PiotrPlotast/simsify-life',
  },
  {
    name: 'Dictionary',
    kind: 'Web app',
    description: 'An English dictionary web app with word search and definitions.',
    stack: ['React', 'TypeScript', 'Tailwind'],
    repo: 'https://github.com/PiotrPlotast/dictionary-web-app',
  },
];

export const skills = [
  'TypeScript',
  'React',
  'React Native',
  'Expo',
  'Astro',
  'Tailwind',
  'Supabase',
  'Electron',
  'JavaScript',
  'HTML & CSS',
  'Git',
];

export const nav: Link[] = [
  { label: 'Projects', href: '/projects' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];
