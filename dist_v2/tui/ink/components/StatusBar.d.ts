/**
 * Status bar rendered below the input box.
 *
 * Left cluster: cwd basename + provider id.
 * Right cluster: model label + cumulative tokens + cost.
 * When busy, a subtle spinner frame appears on the right.
 */
import * as React from 'react';
export interface StatusBarProps {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cwd: string;
    busy: boolean;
    /** Current execution mode (act/plan/verify/ask); visible at all times. */
    mode?: 'act' | 'plan' | 'verify' | 'ask';
    /** Model's context window in tokens — drives the context meter. */
    contextWindow?: number;
    /** Output tokens from the in-progress turn. Drives the tok/s readout. */
    liveOutputTokens?: number;
    /** Wall-clock ms since the in-progress turn started. */
    liveDurationMs?: number;
}
export declare function StatusBar(props: StatusBarProps): React.JSX.Element;
