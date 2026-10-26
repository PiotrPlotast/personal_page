import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'astro/zod';
import { GitHubError, REPO_NAME, type GitHub } from './github';
import type { Knowledge } from './knowledge';
import type { ToolName } from './protocol';

const slug = z.object({ slug: z.string().min(1).max(100) });
const repo = z.object({ name: z.string().regex(REPO_NAME) });
const none = z.looseObject({});

const inputs = {
  get_project: slug,
  get_post: slug,
  list_github_repos: none,
  get_github_repo: repo,
  get_recent_activity: none,
} satisfies Record<ToolName, z.ZodType>;

const definition = (
  name: ToolName,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Anthropic.Tool => ({
  name,
  description,
  input_schema: { type: 'object', properties, required },
});

/** Tool definitions in a fixed order, so the cached prompt prefix never changes between requests. */
export const toolDefinitions: Anthropic.Tool[] = [
  definition(
    'get_project',
    'Get the full case study of one of the featured projects listed in the system prompt.',
    { slug: { type: 'string', description: 'The project slug from the list, e.g. "reclaim".' } },
    ['slug'],
  ),
  definition(
    'get_post',
    'Get the full text of one of the blog posts listed in the system prompt.',
    { slug: { type: 'string', description: 'The post slug from the list.' } },
    ['slug'],
  ),
  definition(
    'list_github_repos',
    "List all of Piotr's public GitHub repositories (forks excluded), most recently pushed first, with description, main language, topics, stars and last push date.",
  ),
  definition(
    'get_github_repo',
    "Get one of Piotr's public GitHub repositories in detail: description, languages, dates and the start of its README.",
    { name: { type: 'string', description: 'Exact repository name, e.g. "accountability-buddies".' } },
    ['name'],
  ),
  definition(
    'get_recent_activity',
    'See what Piotr has worked on lately: the most recently pushed repositories and their latest commit messages.',
  ),
];

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export const isToolName = (name: string): name is ToolName => name in inputs;

/** A short label for the visible "looking something up" line, e.g. the repo name. */
export function toolDetail(name: ToolName, input: unknown): string | undefined {
  const parsed = inputs[name].safeParse(input);
  if (!parsed.success) return undefined;
  const data = parsed.data as { slug?: string; name?: string };
  return data.slug ?? data.name;
}

export function createToolRunner(knowledge: Knowledge, github: GitHub) {
  return async function run(name: string, input: unknown): Promise<ToolOutcome> {
    if (!isToolName(name)) return { content: `Unknown tool "${name}".`, isError: true };
    const parsed = inputs[name].safeParse(input);
    if (!parsed.success) return { content: `Invalid input for ${name}: ${JSON.stringify(input)}`, isError: true };
    const args = parsed.data as { slug?: string; name?: string };

    try {
      switch (name) {
        case 'get_project': {
          const project = knowledge.projects.find((p) => p.slug === args.slug);
          if (!project)
            return notFound(
              'project',
              args.slug,
              knowledge.projects.map((p) => p.slug),
            );
          return {
            content: JSON.stringify({
              name: project.name,
              page: project.path,
              repo: project.repo,
              caseStudy: project.writeup || 'No case study written yet. get_github_repo may know more.',
            }),
          };
        }
        case 'get_post': {
          const post = knowledge.posts.find((p) => p.slug === args.slug);
          if (!post)
            return notFound(
              'post',
              args.slug,
              knowledge.posts.map((p) => p.slug),
            );
          return { content: JSON.stringify({ title: post.title, page: post.path, text: post.body }) };
        }
        case 'list_github_repos':
          return { content: JSON.stringify(await github.listRepos()) };
        case 'get_github_repo':
          return { content: JSON.stringify(await github.getRepo(args.name ?? '')) };
        case 'get_recent_activity':
          return { content: JSON.stringify(await github.recentActivity()) };
      }
    } catch (error) {
      if (error instanceof GitHubError) {
        return {
          content:
            error.status === 404
              ? `There is no public repository named "${args.name}". Call list_github_repos to see the real names.`
              : 'GitHub is not answering right now. Answer from what you already know.',
          isError: true,
        };
      }
      throw error;
    }
  };
}

const notFound = (kind: string, value: string | undefined, known: string[]): ToolOutcome => ({
  content: `No ${kind} with slug "${value}". Known slugs: ${known.join(', ') || 'none'}.`,
  isError: true,
});
