export interface RateLimiterOptions {
  capacity: number;
  refillPerMinute: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly opts: RateLimiterOptions) {
    this.now = opts.now ?? Date.now;
  }

  /** True when the request is allowed. */
  take(key: string): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.opts.capacity, updated: t };
    const refill = ((t - b.updated) / 60_000) * this.opts.refillPerMinute;
    b.tokens = Math.min(this.opts.capacity, b.tokens + refill);
    b.updated = t;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.prune(t);
    return allowed;
  }

  private prune(t: number) {
    for (const [k, b] of this.buckets) {
      if (t - b.updated > 10 * 60_000) this.buckets.delete(k);
    }
  }
}

export const apiLimiter = new RateLimiter({ capacity: 30, refillPerMinute: 30 });
