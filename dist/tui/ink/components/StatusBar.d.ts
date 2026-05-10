import * as React from "react";
import type { ActiveTool } from "../use-tool-progress.js";
import type { RenderMetricsGetters } from "../use-render-metrics.js";
export interface StatusBarProps {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cwd: string;
    busy: boolean;
    /** Current execution mode; badge hidden when 'act' (the default). */
    mode?: "act" | "plan" | "verify" | "ask" | "yolo";
    /** Model's context window in tokens — drives the context meter. */
    contextWindow?: number;
    /** Output tokens from the in-progress turn. Drives the tok/s readout. */
    liveOutputTokens?: number;
    /** Wall-clock ms since the in-progress turn started. */
    liveDurationMs?: number;
    /** Current turn index (1-based) and maximum turns for this loop. */
    turnCount?: number;
    maxTurns?: number;
    /** Flicker detector: true when frame overflow is detected. */
    overflowDetected?: boolean;
    /** Toggle for render-metrics display (Alt+M). */
    showMetrics?: boolean;
    /** Render-metrics getters — populated when showMetrics is true. */
    renderMetrics?: RenderMetricsGetters;
    /** Active tool info — shows tool name and elapsed time when defined. */
    activeTool?: ActiveTool;
}
export declare const StatusBar: React.NamedExoticComponent<StatusBarProps>;
