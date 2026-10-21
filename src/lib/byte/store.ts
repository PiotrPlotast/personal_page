import { Redis } from '@upstash/redis';

/**
 * The little bit of shared state Byte needs: counters (rate limits, spend) and a cache (GitHub).
 * Production uses Upstash Redis so every serverless instance sees the same numbers; without it
 * (local dev, tests) an in-memory store does the same job for a single process.
 */
export interface Store {
  /** Adds `amount` to a counter, creating it with a time-to-live if it's new. Returns the new value. */
  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class MemoryStore implements Store {
  private entries = new Map<string, { value: string; expires: number }>();

  constructor(private now: () => number = Date.now) {}

  private read(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async incrBy(key: string, amount: number, ttlSeconds: number) {
    const entry = this.read(key);
    const value = Number(entry?.value ?? 0) + amount;
    this.entries.set(key, { value: String(value), expires: entry?.expires ?? this.now() + ttlSeconds * 1000 });
    return value;
  }

  async get(key: string) {
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }
}

export class RedisStore implements Store {
  constructor(private redis: Redis) {}

  async incrBy(key: string, amount: number, ttlSeconds: number) {
    const [value] = await this.redis
      .pipeline()
      .incrby(key, amount)
      // NX: only set the expiry when the key has none, so a window doesn't keep sliding forward.
      .expire(key, ttlSeconds, 'NX')
      .exec<[number | string, number]>();
    return Number(value);
  }

  async get(key: string) {
    const value = await this.redis.get<string>(key);
    return value === null ? null : String(value);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }
}

/** Upstash via the Vercel Marketplace sets either the KV_* or the UPSTASH_* pair. */
export function createStore(env: { url?: string | undefined; token?: string | undefined }): Store {
  if (env.url && env.token) {
    // Values are stored as strings (cached JSON included), so skip the client's auto-parsing.
    return new RedisStore(new Redis({ url: env.url, token: env.token, automaticDeserialization: false }));
  }
  return new MemoryStore();
}
