/**
 * Byte's knobs in one place: which model answers, how much it may spend, and how often a visitor
 * may ask. Everything else in src/lib/byte reads from here.
 */

export const MODEL = 'claude-haiku-5-5';

/** Thinking depth. "low" keeps answers fast and cheap; a portfolio Q&A doesn't need more. */
export const EFFORT = 'low';

/** Per-response ceiling, thinking included. Answers are asked to stay short, so this is generous. */
export const MAX_TOKENS = 2048;

/** Model calls per question (each tool lookup costs one more). Stops a confused loop early. */
export const MAX_ROUNDS = 5;

/** USD per million tokens, for prompts up to 100K tokens (ours are ~10K). */
export const PRICES = {
  input: 0.1,
  output: 0.5,
  cacheWrite: 0.125,
  cacheRead: 0.01,
  /** Above 100K prompt tokens every rate is 5× higher. */
  longContextThreshold: 100_000,
  longContextMultiplier: 5,
};

/** Spending caps in USD. The Anthropic Console limit is the hard stop; these keep Byte polite about it. */
export const BUDGET = {
  monthly: 5,
  /** A single viral day can use at most a tenth of the month. */
  daily: 0.5,
};

/** Questions per visitor (by IP). */
export const RATE_LIMITS = [
  { window: 10 * 60, max: 10 },
  { window: 24 * 60 * 60, max: 60 },
] as const;

/** What a visitor can send. Older turns beyond MAX_HISTORY are dropped before calling the model. */
export const INPUT_LIMITS = {
  questionChars: 500,
  answerChars: 4000,
  maxHistory: 12,
  bodyBytes: 64 * 1024,
};

/** A verified visitor skips Turnstile for this long. */
export const SESSION_SECONDS = 6 * 60 * 60;

export const GITHUB = {
  user: 'PiotrPlotast',
  /** Cached GitHub responses keep answers fast and stay far below the API rate limit. */
  cacheSeconds: 60 * 60,
  readmeChars: 6000,
};

/** Long write-ups are cut to keep each question cheap. */
export const DOC_CHARS = 8000;
