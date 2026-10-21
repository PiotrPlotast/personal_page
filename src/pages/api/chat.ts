import Anthropic from '@anthropic-ai/sdk';
import type { APIRoute } from 'astro';
import {
  ANTHROPIC_API_KEY,
  GITHUB_TOKEN,
  KV_REST_API_TOKEN,
  KV_REST_API_URL,
  TURNSTILE_SECRET_KEY,
  UPSTASH_REDIS_REST_TOKEN,
  UPSTASH_REDIS_REST_URL,
} from 'astro:env/server';
import { createGitHub } from '~/lib/byte/github';
import { handleChat, type ChatDeps } from '~/lib/byte/handler';
import { loadKnowledge } from '~/lib/byte/knowledge-source';
import { createStore } from '~/lib/byte/store';
import { verifyTurnstile } from '~/lib/byte/turnstile';

/** Byte's endpoint: the one page of the site that runs on a server (a Vercel function). */
export const prerender = false;

// Created once per server instance and reused across requests.
const store = createStore({
  url: UPSTASH_REDIS_REST_URL ?? KV_REST_API_URL,
  token: UPSTASH_REDIS_REST_TOKEN ?? KV_REST_API_TOKEN,
});
const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const turnstileSecret = TURNSTILE_SECRET_KEY;

const deps: ChatDeps = {
  createStream: client ? (params, { signal }) => client.messages.stream(params, { signal }) : null,
  store,
  github: createGitHub({ store, token: GITHUB_TOKEN }),
  loadKnowledge,
  turnstile: turnstileSecret
    ? { secret: turnstileSecret, verify: (token, ip) => verifyTurnstile(token, turnstileSecret, ip) }
    : null,
};

export const POST: APIRoute = (context) => {
  let ip: string | undefined;
  try {
    ip = context.clientAddress;
  } catch {
    // Not available in every environment (e.g. some local setups); rate limits then share a bucket.
  }
  return handleChat(context.request, ip, deps);
};
