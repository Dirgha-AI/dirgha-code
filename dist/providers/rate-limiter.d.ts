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
 * Also exports:
 *  - PROVIDER_RATE_LIMITS — static table of RPM/TPM/concurrency by provider+tier
 *  - parseRateLimitHeaders — parse X-RateLimit-* headers from any response
 *  - Circuit breaker — opens after 5 consecutive 429s, backs off up to 5min
 *  - TPM sliding window — 60s rolling token counter per provider
 */
import type { Provider } from './iface.js';
export interface RateLimitTier {
    rpm: number;
    tpm: number;
    concurrency: number;
}
export declare const PROVIDER_RATE_LIMITS: Record<string, Record<string, RateLimitTier>>;
/** Run buckets at 85% of stated RPM to absorb clock skew and concurrency spikes. */
export declare const SAFETY_BUFFER = 0.85;
export interface RateLimitHeaderInfo {
    remaining?: number;
    resetAt?: number;
    retryAfterMs?: number;
}
export declare function parseRateLimitHeaders(headers: Record<string, string | undefined>): RateLimitHeaderInfo;
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
    take(maxWaitMs: number): Promise<void>;
    snapshot(): {
        tokens: number;
        capacity: number;
    };
}
export declare function getOrCreateBucket(providerId: string, opts: RateLimitOptions): TokenBucket;
export declare function withRateLimit(inner: Provider, opts: RateLimitOptions): Provider;
export declare function bucketSnapshot(providerId: string, opts: RateLimitOptions): {
    tokens: number;
    capacity: number;
};
export declare function _resetAllBuckets(): void;
export declare function recordProviderSuccess(providerId: string): void;
export declare function recordProvider429(providerId: string, retryAfterMs?: number): void;
export declare function isCircuitOpen(providerId: string): {
    open: boolean;
    waitMs: number;
};
export declare function _resetCircuitBreakers(): void;
export declare function recordTokensUsed(providerId: string, tokens: number): void;
export declare function tokensUsedInWindow(providerId: string): number;
export declare function _resetTpmWindows(): void;
export {};
