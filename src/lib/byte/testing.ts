import Anthropic from '@anthropic-ai/sdk';
import type { CreateStream, StreamLike } from './agent';
import type { Knowledge } from './knowledge';

/** Test helpers: a scripted stand-in for the SDK's MessageStream, and sample knowledge. */

export interface ScriptedTurn {
  text?: string[];
  tools?: { id: string; name: string; input: unknown }[];
  stop?: Anthropic.StopReason;
  usage?: { input_tokens: number; output_tokens: number };
  /** Thrown after the text has streamed, like a dropped connection or an API error. */
  error?: unknown;
}

export function fakeStream(turn: ScriptedTurn): StreamLike {
  const usage = { input_tokens: 1000, output_tokens: 100, ...turn.usage } as Anthropic.Usage;
  const content = [
    ...(turn.text?.length ? [{ type: 'text', text: turn.text.join(''), citations: null }] : []),
    ...(turn.tools ?? []).map((tool) => ({ type: 'tool_use', ...tool })),
  ] as Anthropic.ContentBlock[];
  const message = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'test',
    content,
    stop_reason: turn.stop ?? (turn.tools?.length ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Message;

  return {
    currentMessage: message,
    async *[Symbol.asyncIterator]() {
      for (const text of turn.text ?? []) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text },
        } as Anthropic.MessageStreamEvent;
      }
      if (turn.error) throw turn.error;
    },
    async finalMessage() {
      if (turn.error) throw turn.error;
      return message;
    },
  };
}

/** A CreateStream that plays the given turns in order and records every request it received. */
export function scriptedModel(turns: ScriptedTurn[]) {
  const requests: Anthropic.MessageStreamParams[] = [];
  const createStream: CreateStream = (params) => {
    // Snapshot: the loop keeps appending to the same conversation.
    requests.push(structuredClone(params));
    const turn = turns[requests.length - 1];
    if (!turn) throw new Error(`No scripted turn for request ${requests.length}`);
    return fakeStream(turn);
  };
  return { createStream, requests };
}

export const sampleKnowledge: Knowledge = {
  locale: 'en',
  profile: {
    name: 'Piotr Płotast',
    firstName: 'Piotr',
    nickname: 'Pietrell',
    pronouns: 'he/him',
    role: 'Frontend developer',
    location: 'Poland',
    timezone: 'CET',
    availability: { open: true, label: 'Open to internships' },
    tagline: 'A frontend developer.',
    about: 'Keeps learning.',
    skills: ['TypeScript', 'React'],
    now: ['Building Accountability Buddies'],
    socials: [{ label: 'GitHub', href: 'https://github.com/PiotrPlotast' }],
  },
  agentName: 'Byte',
  pages: [
    { key: 'home', label: 'Home', path: '/' },
    { key: 'projects', label: 'Projects', path: '/projects/' },
    { key: 'blog', label: 'Blog', path: '/blog/' },
    { key: 'about', label: 'About', path: '/about/' },
    { key: 'contact', label: 'Contact', path: '/contact/' },
  ],
  projects: [
    {
      slug: 'reclaim',
      name: 'Reclaim',
      kind: 'Desktop app',
      status: 'active',
      summary: 'Takes back your time.',
      stack: ['Electron'],
      repo: 'https://github.com/PiotrPlotast/reclaim',
      path: '/projects/reclaim/',
      writeup: '',
    },
  ],
  posts: [
    {
      slug: 'how-i-built-this-site',
      title: 'How I built this site',
      description: 'Astro and a bento.',
      published: '2026-10-19',
      tags: ['Astro'],
      path: '/blog/how-i-built-this-site/',
      body: 'The full post.',
    },
  ],
  experience: [],
};

export { Anthropic };
