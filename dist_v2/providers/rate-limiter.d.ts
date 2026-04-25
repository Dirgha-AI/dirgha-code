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
import type { Provider } from './iface.js';
export interface RateLimitOptions {
    /** Allowed requests per second (steady-state). */
    rps: number;
    /** Maximum burst size (bucket capacity). Default: rps × 2. */
    burst?: number;
    /** Max time to wait for a token before giving up. Default: 30 s. */
    maxWaitMs?: number;
}
declare class TokenBucket {
    private capacity;
    private fillRatePerMs;
    private tokens;
    private lastRefill;
    constructor(capacity: number, fillRatePerMs: number);
    private refill;
    /** Wait until one token is available. Resolves when consumed. Rejects on timeout. */
    take(maxWaitMs: number): Promise<void>;
    snapshot(): {
        tokens: number;
        capacity: number;
    };
}
export declare function getOrCreateBucket(providerId: string, opts: RateLimitOptions): TokenBucket;
export declare function withRateLimit(inner: Provider, opts: RateLimitOptions): Provider;
/** Test/debug helper. Does NOT take a token — peeks only. */
export declare function bucketSnapshot(providerId: string, opts: RateLimitOptions): {
    tokens: number;
    capacity: number;
};
/** Test helper to reset all buckets between tests. */
export declare function _resetAllBuckets(): void;
export {};
