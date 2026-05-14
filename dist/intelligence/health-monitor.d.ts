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
export type HealthKey = `${string}:${string}`;
export interface ProviderHealth {
    provider: string;
    model: string;
    status: 'healthy' | 'cooldown' | 'failover_blacklisted';
    totalRequests: number;
    avgLatencyMs: number;
    failureCount: number;
    failoverCount: number;
    failoverBlacklisted: boolean;
    cooldownLevel: number;
    cooldownUntil: number | null;
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
}
/**
 * Record a successful API call for a given (provider, model).
 *
 * Resets the failure window, clears failover state, and advances
 * cooldown recovery (decrements cooldown level after 2 consecutive successes).
 * Persists the updated state to disk.
 */
export declare function recordSuccess(provider: string, model: string, latencyMs: number): void;
/**
 * Record a failure for a given (provider, model).
 *
 * Counts failures in a rolling window; if the threshold (5) is reached,
 * activates cooldown and increments the cooldown level.
 * Does NOT affect failover state.
 * Persists the updated state to disk.
 */
export declare function recordFailure(provider: string, model: string, _error: string): void;
/**
 * Record a failover event for a given (provider, model).
 *
 * Increments the failover counter. If the counter reaches MAX_FAILOVERS (3),
 * marks the model as failover-blacklisted.
 * Does NOT affect cooldown state.
 * Persists the updated state to disk.
 */
export declare function recordFailoverEvent(provider: string, model: string): void;
/**
 * Check whether a given (provider, model) is currently blacklisted.
 *
 * A model is blacklisted if either:
 * - failoverBlacklisted is true, OR
 * - a cooldown is active AND no probe is currently in flight.
 *
 * When a cooldown is active and no probe is in flight, one probe is allowed
 * through (sets probeActive=true, returns false). Subsequent calls while the
 * probe is pending will return true (blocked) until the probe resolves via
 * recordSuccess or recordFailure.
 */
export declare function isBlacklisted(provider: string, model: string): boolean;
/**
 * Return a snapshot of the health state for a given (provider, model),
 * or null if no entry exists.
 */
export declare function getHealth(provider: string, model: string): ProviderHealth | null;
/**
 * Return an array of all tracked health entries.
 */
export declare function getAllHealth(): ProviderHealth[];
/**
 * Remove all health tracking for a given (provider, model) and persist.
 */
export declare function resetHealth(provider: string, model: string): void;
