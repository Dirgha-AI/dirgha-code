/**
 * Provider health monitor.
 *
 * Tracks per-provider health stats across sessions.
 * Stored in ~/.dirgha/health.json.
 *
 * Blacklisting logic:
 *   - After 5 consecutive failures within 5 minutes, blacklist for 30 minutes.
 *   - After blacklist expires, allow one probe request.
 *   - After 10 probe failures, blacklist for 24 hours.
 *   - Recovery: after 3 consecutive successes, clear the blacklist.
 */
export interface ProviderHealth {
    provider: string;
    totalRequests: number;
    failures: number;
    lastFailure: number;
    lastSuccess: number;
    avgLatencyMs: number;
    blacklistedUntil: number | null;
}
export declare function recordSuccess(provider: string, latencyMs: number): void;
export declare function recordFailure(provider: string, _error: string): void;
export declare function isBlacklisted(provider: string): boolean;
export declare function getHealth(provider: string): ProviderHealth | null;
export declare function getAllHealth(): ProviderHealth[];
export declare function resetHealth(provider: string): void;
