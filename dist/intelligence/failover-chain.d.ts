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
 *
 * Self-healing features:
 *   - Blacklists a model for the session after 5 consecutive failovers.
 *   - Logs every failover event via the injected session logger.
 *   - Falls through to the cheapest free model from the catalog when
 *     no paid or family-alternative model is available.
 *
 * Failover blacklist state now lives in health-monitor.ts (unified).
 * This file delegates to health-monitor for persistent blacklist checks.
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
    /**
     * Optional session logger. When provided, every failover event is
     * appended as a system entry so the session transcript records
     * which tiers were tried and why the chain advanced.
     */
    sessionLogger?: {
        append(entry: {
            type: "system";
            ts: string;
            event: string;
            data?: Record<string, unknown>;
        }): Promise<void>;
    };
}
export declare function recordFailover(modelId: string, sessionLogger?: FailoverOptions["sessionLogger"]): void;
export declare function resetFailoverState(): void;
export declare function resetModelBlacklist(modelId: string): void;
export declare function buildFailoverChain(modelId: string, opts?: FailoverOptions): FailoverChain;
