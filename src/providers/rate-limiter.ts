/**
 * Rate-limiting middleware for Provider.stream().
 *
 * A token-bucket per provider id smooths over the difference between
 * "1 RPS" published quotas and bursty agent behavior. The provider
 * call still goes out — we only delay it. If the bucket is empty when
 * a stream starts, the call awaits up to `maxWaitMs` for a token; past
 * that it throws a ProviderError with status=429 so the agent loop's
 * normal failover/retry path picks it up.
 *
 * Usage:
 *   const limited = withRateLimit(provider, { rps: 2, burst: 4 });
 *   limited.stream(req)  // honors the bucket
 *
 * Stays out of every concrete provider class — it's a pure decorator
 * over the Provider interface.
 */

import type { Provider, StreamRequest } from './iface.js';
import type { AgentEvent } from '../kernel/types.js';
import { ProviderError } from './iface.js';

export interface RateLimitOptions {
  /** Allowed requests per second (steady-state). */
  rps: number;
  /** Maximum burst size (bucket capacity). Default: rps × 2. */
  burst?: number;
  /** Max time to wait for a token before giving up. Default: 30 s. */
  maxWaitMs?: number;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private fillRatePerMs: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  private refill(): void {
    const now = Date.now();
    const delta = (now - this.lastRefill) * this.fillRatePerMs;
    this.tokens = Math.min(this.capacity, this.tokens + delta);
    this.lastRefill = now;
  }
  /** Wait until one token is available. Resolves when consumed. Rejects on timeout. */
  async take(maxWaitMs: number): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    // Spin loop with sleep based on deficit — bounded by the deadline.
    // This keeps the implementation simple without a queue.
    while (true) {
      this.refill();
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      const waitMs = Math.max(10, Math.ceil((1 - this.tokens) / this.fillRatePerMs));
      if (Date.now() + waitMs > deadline) {
        throw new ProviderError(`rate limit: bucket empty (tokens=${this.tokens.toFixed(2)}, waited >= ${maxWaitMs}ms)`, 'rate-limit', 429, true);
      }
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  snapshot(): { tokens: number; capacity: number } {
    this.refill();
    return { tokens: this.tokens, capacity: this.capacity };
  }
}

const buckets = new Map<string, TokenBucket>();

export function getOrCreateBucket(providerId: string, opts: RateLimitOptions): TokenBucket {
  const key = `${providerId}:${opts.rps}:${opts.burst ?? opts.rps * 2}`;
  let b = buckets.get(key);
  if (!b) {
    const burst = opts.burst ?? Math.max(1, Math.ceil(opts.rps * 2));
    b = new TokenBucket(burst, opts.rps / 1000);
    buckets.set(key, b);
  }
  return b;
}

export function withRateLimit(inner: Provider, opts: RateLimitOptions): Provider {
  const maxWaitMs = opts.maxWaitMs ?? 30_000;
  const bucket = getOrCreateBucket(inner.id, opts);
  return {
    id: inner.id,
    supportsTools: (m: string) => inner.supportsTools(m),
    supportsThinking: (m: string) => inner.supportsThinking(m),
    async *stream(req: StreamRequest): AsyncIterable<AgentEvent> {
      await bucket.take(maxWaitMs);
      yield* inner.stream(req);
    },
    ...(inner.generateImage ? { generateImage: inner.generateImage.bind(inner) } : {}),
  };
}

/** Test/debug helper. Does NOT take a token — peeks only. */
export function bucketSnapshot(providerId: string, opts: RateLimitOptions): { tokens: number; capacity: number } {
  return getOrCreateBucket(providerId, opts).snapshot();
}

/** Test helper to reset all buckets between tests. */
export function _resetAllBuckets(): void {
  buckets.clear();
}
