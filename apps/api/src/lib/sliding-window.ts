/**
 * In-memory sliding-window rate limiter keyed by an ID (e.g. user ID). Shared by the REST and
 * Socket.IO paths of the same feature so a client can't double its allowance by switching
 * transport. Single-process only (see docs/chat/architecture.md#scaling).
 */
export interface SlidingWindowLimiter {
  /** Records one hit. Returns false (without recording) when the key is over its limit. */
  take(key: string): boolean;
  /** Seconds until the oldest hit leaves the window. */
  retryAfterSeconds(key: string): number;
}

export function createSlidingWindowLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): SlidingWindowLimiter {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;

  function recent(key: string): number[] {
    const cutoff = now() - options.windowMs;
    const list = (hits.get(key) ?? []).filter((time) => time > cutoff);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  }

  return {
    take(key) {
      const list = recent(key);
      if (list.length >= options.limit) return false;
      list.push(now());
      hits.set(key, list);
      return true;
    },
    retryAfterSeconds(key) {
      const [oldest] = recent(key);
      if (oldest === undefined) return 0;
      return Math.max(1, Math.ceil((oldest + options.windowMs - now()) / 1000));
    },
  };
}
