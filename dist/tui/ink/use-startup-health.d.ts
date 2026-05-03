/**
 * Startup health check hook — runs lightweight doctor checks once on
 * mount, cached for 24 hours. Non-blocking; emits a warning banner
 * if any check fails.
 */
export interface HealthResult {
    allOk: boolean;
    failures: string[];
}
export declare function useStartupHealth(): HealthResult | null;
