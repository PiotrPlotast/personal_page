import { PRICES } from './config';

/** The token counts the API reports for one model call (a subset of Anthropic.Usage). */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Cost of one model call in micro-dollars (1 = $0.000001), rounded up so budgets never under-count. */
export function costMicros(usage: TokenUsage): number {
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cacheWrite + cacheRead;
  const multiplier = promptTokens > PRICES.longContextThreshold ? PRICES.longContextMultiplier : 1;
  // Prices are USD per million tokens, so tokens × price is already in micro-dollars.
  const micros =
    multiplier *
    (usage.input_tokens * PRICES.input +
      usage.output_tokens * PRICES.output +
      cacheWrite * PRICES.cacheWrite +
      cacheRead * PRICES.cacheRead);
  return Math.ceil(micros);
}

export const dollarsToMicros = (usd: number) => Math.round(usd * 1_000_000);
