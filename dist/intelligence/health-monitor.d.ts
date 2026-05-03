/**
 * Provider health monitor — smart exponential-backoff cooldown.
 *
 * Tracks per-provider health across sessions. Stored in ~/.dirgha/health.json.
 *
 * Design principles:
 *   1. Don't punish transient blips. A few failures in a window → short cooldown.
 *   2. Escalate only for persistent failures. Cooldown grows exponentially.
 *   3. Success decays the failure window aggressively. 2 successes = fresh start.
 *   4. Cooldown level decays over 24h of good behavior.
 */
export interface ProviderHealth {
    provider: string;
    totalRequests: number;
    failures: number;
    lastFailure: number;
    lastSuccess: number;
    avgLatencyMs: number;
    blacklistedUntil: number | null;
    cooldownLevel: number;
}
export declare function recordSuccess(provider: string, latencyMs: number): void;
export declare function recordFailure(provider: string, _error: string): void;
export declare function isBlacklisted(provider: string): boolean;
export declare function getHealth(provider: string): ProviderHealth | null;
export declare function getAllHealth(): ProviderHealth[];
export declare function resetHealth(provider: string): void;
