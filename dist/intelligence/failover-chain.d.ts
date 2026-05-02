/**
 * Failover cascade engine. Multi-tier model substitution when the
 * primary provider returns 4xx/5xx, rate-limits, or times out.
 *
 * Strategy:
 *   1. primary      — user's chosen model (tier 1)
 *   2. secondary    — same-family fallback (tier 2)
 *   3. tertiary     — family-alternatives registry (tier 3)
 *   4. freeFallback — always-available free-tier model (tier 4)
 *
 * Health-aware: skips tiers whose provider health score is below
 * the minimum threshold.
 */
export interface FailoverTier {
    model: string;
    reason: string;
}
export interface FailoverChain {
    tiers: FailoverTier[];
    exhausted: boolean;
}
export interface FailoverOptions {
    healthThreshold?: number;
    healthScores?: Record<string, number>;
    maxTiers?: number;
}
export declare function buildFailoverChain(modelId: string, opts?: FailoverOptions): FailoverChain;
