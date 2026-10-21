import { BUDGET, RATE_LIMITS } from './config';
import { dollarsToMicros } from './cost';
import type { Store } from './store';

const DAY = 24 * 60 * 60;

/**
 * Counts one question for this visitor in every rate-limit window. Fixed windows: simple, cheap
 * (one Redis round trip per window) and good enough to stop someone hammering the chat.
 */
export async function takeRateLimit(
  store: Store,
  visitor: string,
  now: Date,
  limits: readonly { window: number; max: number }[] = RATE_LIMITS,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const seconds = Math.floor(now.getTime() / 1000);
  let retryAfter = 0;
  for (const { window, max } of limits) {
    const slot = Math.floor(seconds / window);
    const count = await store.incrBy(`byte:rl:${window}:${slot}:${visitor}`, 1, window);
    if (count > max) retryAfter = Math.max(retryAfter, (slot + 1) * window - seconds);
  }
  return retryAfter > 0 ? { ok: false, retryAfter } : { ok: true };
}

const dayKey = (now: Date) => `byte:spend:day:${now.toISOString().slice(0, 10)}`;
const monthKey = (now: Date) => `byte:spend:month:${now.toISOString().slice(0, 7)}`;

/** True while today's and this month's spend are both under their caps (UTC days and months). */
export async function withinBudget(store: Store, now: Date, budget = BUDGET): Promise<boolean> {
  const [day, month] = await Promise.all([store.get(dayKey(now)), store.get(monthKey(now))]);
  return Number(day ?? 0) < dollarsToMicros(budget.daily) && Number(month ?? 0) < dollarsToMicros(budget.monthly);
}

export async function recordSpend(store: Store, now: Date, micros: number): Promise<void> {
  if (micros <= 0) return;
  await Promise.all([store.incrBy(dayKey(now), micros, 2 * DAY), store.incrBy(monthKey(now), micros, 40 * DAY)]);
}

/** Visitors are counted by a hash of their IP, so raw addresses never sit in the store. */
export async function visitorId(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`byte:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
