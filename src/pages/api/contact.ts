import type { APIRoute } from 'astro';
import {
  CONTACT_FROM_EMAIL,
  CONTACT_TO_EMAIL,
  KV_REST_API_TOKEN,
  KV_REST_API_URL,
  RESEND_API_KEY,
  TURNSTILE_SECRET_KEY,
  UPSTASH_REDIS_REST_TOKEN,
  UPSTASH_REDIS_REST_URL,
} from 'astro:env/server';
import { createStore } from '~/lib/byte/store';
import { verifyTurnstile } from '~/lib/byte/turnstile';
import { handleContact, type ContactDeps } from '~/lib/contact/handler';
import { sendWithResend } from '~/lib/contact/resend';

/** The contact form's endpoint: sends each message to Piotr's inbox through Resend. */
export const prerender = false;

const store = createStore({
  url: UPSTASH_REDIS_REST_URL ?? KV_REST_API_URL,
  token: UPSTASH_REDIS_REST_TOKEN ?? KV_REST_API_TOKEN,
});

const apiKey = RESEND_API_KEY;
const to = CONTACT_TO_EMAIL;
// Resend's shared test sender works until a domain is verified (it can only send to your own address).
const from = CONTACT_FROM_EMAIL ?? 'Portfolio contact form <onboarding@resend.dev>';
const turnstileSecret = TURNSTILE_SECRET_KEY;

const deps: ContactDeps = {
  send: apiKey && to ? (email) => sendWithResend(apiKey, { ...email, from, to }) : null,
  store,
  verifyTurnstile: turnstileSecret ? (token, ip) => verifyTurnstile(token, turnstileSecret, ip) : null,
  siteName: new URL(import.meta.env.SITE ?? 'https://piotrplotast.vercel.app').host,
};

export const POST: APIRoute = (context) => {
  let ip: string | undefined;
  try {
    ip = context.clientAddress;
  } catch {
    // Not available in every environment; rate limits then share a bucket.
  }
  return handleContact(context.request, ip, deps);
};
