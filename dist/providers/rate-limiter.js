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
import { ProviderError } from './iface.js';
class TokenBucket {
    capacity;
    fillRatePerMs;
    tokens;
    lastRefill;
    constructor(capacity, fillRatePerMs) {
        this.capacity = capacity;
        this.fillRatePerMs = fillRatePerMs;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }
    refill() {
        const now = Date.now();
        const delta = (now - this.lastRefill) * this.fillRatePerMs;
        this.tokens = Math.min(this.capacity, this.tokens + delta);
        this.lastRefill = now;
    }
    /** Wait until one token is available. Resolves when consumed. Rejects on timeout. */
    async take(maxWaitMs) {
        const deadline = Date.now() + maxWaitMs;
        // Spin loop with sleep based on deficit — bounded by the deadline.
        // This keeps the implementation simple without a queue.
        while (true) {
            this.refill();
            if (this.tokens >= 1) {
                this.tokens -= 1;
                return;
            }
            const waitMs = Math.max(10, Math.ceil((1 - this.tokens) / this.fillRatePerMs));
            if (Date.now() + waitMs > deadline) {
                throw new ProviderError(`rate limit: bucket empty (tokens=${this.tokens.toFixed(2)}, waited >= ${maxWaitMs}ms)`, 'rate-limit', 429, true);
            }
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    snapshot() {
        this.refill();
        return { tokens: this.tokens, capacity: this.capacity };
    }
}
const buckets = new Map();
export function getOrCreateBucket(providerId, opts) {
    const key = `${providerId}:${opts.rps}:${opts.burst ?? opts.rps * 2}`;
    let b = buckets.get(key);
    if (!b) {
        const burst = opts.burst ?? Math.max(1, Math.ceil(opts.rps * 2));
        b = new TokenBucket(burst, opts.rps / 1000);
        buckets.set(key, b);
    }
    return b;
}
export function withRateLimit(inner, opts) {
    const maxWaitMs = opts.maxWaitMs ?? 30_000;
    const bucket = getOrCreateBucket(inner.id, opts);
    return {
        id: inner.id,
        supportsTools: (m) => inner.supportsTools(m),
        supportsThinking: (m) => inner.supportsThinking(m),
        async *stream(req) {
            await bucket.take(maxWaitMs);
            yield* inner.stream(req);
        },
        ...(inner.generateImage ? { generateImage: inner.generateImage.bind(inner) } : {}),
    };
}
/** Test/debug helper. Does NOT take a token — peeks only. */
export function bucketSnapshot(providerId, opts) {
    return getOrCreateBucket(providerId, opts).snapshot();
}
/** Test helper to reset all buckets between tests. */
export function _resetAllBuckets() {
    buckets.clear();
}
//# sourceMappingURL=rate-limiter.js.map