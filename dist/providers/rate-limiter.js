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
import { ProviderError } from './iface.js';
export const PROVIDER_RATE_LIMITS = {
    anthropic: {
        tier1: { rpm: 50, tpm: 40_000, concurrency: 2 },
        tier2: { rpm: 1_000, tpm: 200_000, concurrency: 10 },
        tier4: { rpm: 4_000, tpm: 800_000, concurrency: 40 },
    },
    openai: {
        free: { rpm: 3, tpm: 40_000, concurrency: 1 },
        tier1: { rpm: 500, tpm: 200_000, concurrency: 5 },
        tier5: { rpm: 10_000, tpm: 10_000_000, concurrency: 100 },
    },
    deepseek: {
        free: { rpm: 60, tpm: 500_000, concurrency: 2 },
        paid: { rpm: 500, tpm: 5_000_000, concurrency: 10 },
    },
    google: {
        "free-flash": { rpm: 15, tpm: 1_000_000, concurrency: 1 },
        "paid-flash": { rpm: 2_000, tpm: 4_000_000, concurrency: 20 },
        "free-pro": { rpm: 2, tpm: 32_000, concurrency: 1 },
        "paid-pro": { rpm: 1_000, tpm: 4_000_000, concurrency: 10 },
    },
    nvidia: {
        free: { rpm: 400, tpm: 200_000, concurrency: 4 },
        paid: { rpm: 2_000, tpm: 1_000_000, concurrency: 20 },
    },
    openrouter: {
        free: { rpm: 20, tpm: 100_000, concurrency: 1 },
        paid: { rpm: 200, tpm: 1_000_000, concurrency: 5 },
    },
    mistral: {
        free: { rpm: 5, tpm: 40_000, concurrency: 1 },
        paid: { rpm: 500, tpm: 500_000, concurrency: 10 },
    },
    together: {
        free: { rpm: 60, tpm: 1_000_000, concurrency: 2 },
        paid: { rpm: 600, tpm: 10_000_000, concurrency: 10 },
    },
};
/** Run buckets at 85% of stated RPM to absorb clock skew and concurrency spikes. */
export const SAFETY_BUFFER = 0.85;
export function parseRateLimitHeaders(headers) {
    const result = {};
    const remainingRaw = headers['x-ratelimit-remaining-requests'] ??
        headers['x-ratelimit-remaining'] ??
        headers['x-ratelimit-remaining-tokens'];
    if (remainingRaw !== undefined) {
        const n = parseInt(remainingRaw, 10);
        if (!isNaN(n))
            result.remaining = n;
    }
    const resetRaw = headers['x-ratelimit-reset-requests'] ??
        headers['x-ratelimit-reset'] ??
        headers['x-ratelimit-reset-epoch'];
    if (resetRaw !== undefined) {
        const n = parseInt(resetRaw, 10);
        if (!isNaN(n))
            result.resetAt = n * 1000;
    }
    const retryAfterRaw = headers['retry-after'];
    if (retryAfterRaw !== undefined) {
        const n = parseInt(retryAfterRaw, 10);
        if (!isNaN(n))
            result.retryAfterMs = n * 1000;
    }
    return result;
}
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
    async take(maxWaitMs) {
        const deadline = Date.now() + maxWaitMs;
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
export function bucketSnapshot(providerId, opts) {
    return getOrCreateBucket(providerId, opts).snapshot();
}
export function _resetAllBuckets() {
    buckets.clear();
}
const _circuitBreakers = new Map();
const CIRCUIT_OPEN_THRESHOLD = 5;
const CIRCUIT_MIN_COOLDOWN_MS = 60_000;
const CIRCUIT_MAX_COOLDOWN_MS = 300_000;
export function recordProviderSuccess(providerId) {
    const state = _circuitBreakers.get(providerId);
    if (state) {
        state.consecutiveErrors = 0;
        state.openUntil = 0;
        state.cooldownMs = CIRCUIT_MIN_COOLDOWN_MS;
    }
}
export function recordProvider429(providerId, retryAfterMs) {
    let state = _circuitBreakers.get(providerId);
    if (!state) {
        state = { consecutiveErrors: 0, openUntil: 0, cooldownMs: CIRCUIT_MIN_COOLDOWN_MS };
        _circuitBreakers.set(providerId, state);
    }
    state.consecutiveErrors++;
    if (state.consecutiveErrors >= CIRCUIT_OPEN_THRESHOLD) {
        const jitter = Math.random() * 1000;
        const waitMs = retryAfterMs
            ? Math.max(retryAfterMs, state.cooldownMs) + jitter
            : state.cooldownMs + jitter;
        state.openUntil = Date.now() + Math.min(waitMs, CIRCUIT_MAX_COOLDOWN_MS);
        state.cooldownMs = Math.min(state.cooldownMs * 2, CIRCUIT_MAX_COOLDOWN_MS);
    }
}
export function isCircuitOpen(providerId) {
    const state = _circuitBreakers.get(providerId);
    if (!state || state.openUntil === 0)
        return { open: false, waitMs: 0 };
    const waitMs = state.openUntil - Date.now();
    if (waitMs <= 0) {
        state.openUntil = 0;
        state.consecutiveErrors = 0;
        return { open: false, waitMs: 0 };
    }
    return { open: true, waitMs };
}
export function _resetCircuitBreakers() {
    _circuitBreakers.clear();
}
const _tpmWindows = new Map();
const TPM_WINDOW_MS = 60_000;
export function recordTokensUsed(providerId, tokens) {
    let window = _tpmWindows.get(providerId);
    if (!window) {
        window = [];
        _tpmWindows.set(providerId, window);
    }
    const cutoff = Date.now() - TPM_WINDOW_MS;
    // Evict stale entries then push new one
    const start = window.findIndex(e => e.ts >= cutoff);
    if (start > 0)
        window.splice(0, start);
    window.push({ ts: Date.now(), tokens });
}
export function tokensUsedInWindow(providerId) {
    const window = _tpmWindows.get(providerId);
    if (!window)
        return 0;
    const cutoff = Date.now() - TPM_WINDOW_MS;
    return window.filter(e => e.ts >= cutoff).reduce((s, e) => s + e.tokens, 0);
}
export function _resetTpmWindows() {
    _tpmWindows.clear();
}
//# sourceMappingURL=rate-limiter.js.map