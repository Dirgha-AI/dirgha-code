/**
 * Provider health tracking — multi-dimensional 0-1 score.
 * Ported from monorepo providers/health.ts for release repo v1.17.0.
 *
 * Dimensions: latency (timer), error rate (window), rate limit hits (decay), cost factor.
 * Score decay: exponential with 5min half-life so stale data doesn't dominate.
 */
import type { ProviderId } from "./dispatch.js";
export declare function recordRequest(provider: string, ok: boolean, latMs: number): void;
export declare function recordRateLimit(provider: string): void;
export declare function healthScore(provider: string): number;
export declare function bestProvider(providers: ProviderId[]): ProviderId;
export declare function resetHealth(provider: string): void;
