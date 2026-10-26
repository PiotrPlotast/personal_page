import { describe, expect, it } from 'vitest';
import { createGitHub } from './github';
import { MemoryStore } from './store';

const repo = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: `${name} description`,
  html_url: `https://github.com/PiotrPlotast/${name}`,
  homepage: null,
  language: 'TypeScript',
  topics: ['react'],
  stargazers_count: 3,
  fork: false,
  archived: false,
  pushed_at: '2026-10-20T10:00:00Z',
  created_at: '2025-01-01T10:00:00Z',
  ...extra,
});

/** A fake api.github.com: routes by path, counts calls, records headers. */
function fakeGitHub(routes: Record<string, unknown>) {
  const calls: { path: string; headers: Headers }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const { pathname, search } = new URL(url);
    const path = pathname + search;
    calls.push({ path, headers: new Headers(init?.headers) });
    if (!(path in routes)) return new Response('Not Found', { status: 404 });
    const body = routes[path];
    return typeof body === 'string' ? new Response(body) : Response.json(body);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

const LIST = '/users/PiotrPlotast/repos?type=owner&sort=pushed&per_page=100';

describe('GitHub tools', () => {
  it('lists own repos without forks', async () => {
    const api = fakeGitHub({ [LIST]: [repo('reclaim'), repo('forked', { fork: true })] });
    const github = createGitHub({ store: new MemoryStore(), fetch: api.fetch });
    expect(await github.listRepos()).toEqual([
      {
        name: 'reclaim',
        description: 'reclaim description',
        url: 'https://github.com/PiotrPlotast/reclaim',
        language: 'TypeScript',
        topics: ['react'],
        stars: 3,
        lastPush: '2026-10-20',
      },
    ]);
  });

  it('describes a repo with languages and a trimmed README', async () => {
    const api = fakeGitHub({
      '/repos/PiotrPlotast/reclaim': repo('reclaim', { homepage: 'https://reclaim.app' }),
      '/repos/PiotrPlotast/reclaim/languages': { TypeScript: 750, CSS: 250 },
      '/repos/PiotrPlotast/reclaim/readme':
        '# Reclaim\n![badge](https://img.shields.io/x)\n<!-- note -->\nTakes back your time.',
    });
    const github = createGitHub({ store: new MemoryStore(), fetch: api.fetch, token: 'tok' });
    const details = await github.getRepo('reclaim');
    expect(details).toMatchObject({
      homepage: 'https://reclaim.app',
      created: '2025-01-01',
      languages: ['TypeScript 75%', 'CSS 25%'],
      readme: '# Reclaim\n\nTakes back your time.',
    });
    expect(api.calls[0]?.headers.get('authorization')).toBe('Bearer tok');
    expect(api.calls.find((c) => c.path.endsWith('/readme'))?.headers.get('accept')).toBe('application/vnd.github.raw');
  });

  it('only ever looks at the configured account', async () => {
    const api = fakeGitHub({});
    const github = createGitHub({ store: new MemoryStore(), fetch: api.fetch });
    await expect(github.getRepo('../../users/someone-else')).rejects.toThrow('valid repository name');
    expect(api.calls).toHaveLength(0);
  });

  it('caches responses', async () => {
    const api = fakeGitHub({ [LIST]: [repo('reclaim')] });
    const github = createGitHub({ store: new MemoryStore(), fetch: api.fetch });
    await github.listRepos();
    await github.listRepos();
    expect(api.calls).toHaveLength(1);
  });

  it('summarizes recent activity from the latest commits', async () => {
    const api = fakeGitHub({
      [LIST]: [repo('reclaim'), repo('quiet')],
      '/repos/PiotrPlotast/reclaim/commits?per_page=4': [
        { commit: { message: 'Add focus timer\n\nLong body', author: { date: '2026-10-20T09:00:00Z' } } },
      ],
    });
    const github = createGitHub({ store: new MemoryStore(), fetch: api.fetch });
    expect(await github.recentActivity()).toEqual([
      {
        repo: 'reclaim',
        description: 'reclaim description',
        lastPush: '2026-10-20',
        recentCommits: [{ date: '2026-10-20', message: 'Add focus timer' }],
      },
      { repo: 'quiet', description: 'quiet description', lastPush: '2026-10-20', recentCommits: [] },
    ]);
  });
});
