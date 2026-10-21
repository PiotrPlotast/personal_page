import { GITHUB } from './config';
import { cleanDoc } from './knowledge';
import type { Store } from './store';

/**
 * Read-only lookups of Piotr's public GitHub, for Byte's tools. The owner is fixed here, so the
 * model can only ever pick a repo name, never browse someone else's account. Responses are cached
 * (shared store) for an hour.
 */

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface RepoResponse {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
  created_at: string;
}

interface CommitResponse {
  commit: { message: string; author: { date: string } | null };
}

export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

const day = (iso: string) => iso.slice(0, 10);

const summarize = (repo: RepoResponse) => ({
  name: repo.name,
  description: repo.description ?? '',
  url: repo.html_url,
  ...(repo.homepage ? { homepage: repo.homepage } : {}),
  language: repo.language,
  topics: repo.topics ?? [],
  stars: repo.stargazers_count,
  ...(repo.archived ? { archived: true } : {}),
  lastPush: day(repo.pushed_at),
});

export function createGitHub(options: {
  store: Store;
  fetch?: typeof fetch;
  token?: string | undefined;
  user?: string;
}) {
  const { store, token, user = GITHUB.user } = options;
  const fetchImpl = options.fetch ?? fetch;

  async function get<T>(path: string, accept = 'application/vnd.github+json'): Promise<T> {
    const key = `byte:gh:${accept === 'application/vnd.github+json' ? '' : 'raw:'}${path}`;
    const cached = await store.get(key);
    if (cached !== null) return JSON.parse(cached) as T;

    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'personal-page-byte',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new GitHubError(`GitHub answered ${response.status} for ${path}`, response.status);
    const data = (accept.endsWith('raw') ? await response.text() : await response.json()) as T;
    await store.set(key, JSON.stringify(data), GITHUB.cacheSeconds);
    return data;
  }

  async function listRepos() {
    const repos = await get<RepoResponse[]>(`/users/${user}/repos?type=owner&sort=pushed&per_page=100`);
    return repos.filter((repo) => !repo.fork).map(summarize);
  }

  async function getRepo(name: string) {
    if (!REPO_NAME.test(name)) throw new GitHubError(`"${name}" isn't a valid repository name`, 400);
    const repo = await get<RepoResponse>(`/repos/${user}/${name}`);
    const [languages, readme] = await Promise.all([
      get<Record<string, number>>(`/repos/${user}/${name}/languages`).catch(() => ({})),
      get<string>(`/repos/${user}/${name}/readme`, 'application/vnd.github.raw').catch(() => ''),
    ]);
    const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
    return {
      ...summarize(repo),
      created: day(repo.created_at),
      languages: Object.entries(languages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([language, bytes]) => `${language} ${Math.round((bytes / total) * 100)}%`),
      // Badges and images are noise for the model; the text is what matters.
      readme: cleanDoc(readme.replace(/!\[[^\]]*\]\([^)]*\)/g, ''), GITHUB.readmeChars),
    };
  }

  /** What Piotr pushed to most recently: the latest repos and their last few commit messages. */
  async function recentActivity() {
    const repos = (await listRepos()).slice(0, 4);
    return Promise.all(
      repos.map(async (repo) => {
        const commits = await get<CommitResponse[]>(`/repos/${user}/${repo.name}/commits?per_page=4`).catch(() => []);
        return {
          repo: repo.name,
          description: repo.description,
          lastPush: repo.lastPush,
          recentCommits: commits.map(({ commit }) => ({
            date: commit.author ? day(commit.author.date) : undefined,
            message: commit.message.split('\n')[0]?.slice(0, 140) ?? '',
          })),
        };
      }),
    );
  }

  return { listRepos, getRepo, recentActivity };
}

export type GitHub = ReturnType<typeof createGitHub>;
