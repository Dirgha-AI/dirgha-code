/**
 * Render performance metrics hook.
 *
 * Tracks per-frame timing, computes session aggregates (avg / p99),
 * and persists cumulative totals to ~/.dirgha/state.json so long-running
 * sessions can track performance trends.
 */
export interface RenderMetricsGetters {
    framesThisSession: () => number;
    avgFrameTimeMs: () => number;
    p99FrameTimeMs: () => number;
    lastFrameTimeMs: () => number;
}
export declare function useRenderMetrics(): RenderMetricsGetters;
