/**
 * Tool invocation block.
 *
 * Consumes the state that App derives from tool_exec_start and
 * tool_exec_end events. While a tool is in flight we render a spinner;
 * on completion we show ✓ or ✗ plus the elapsed time and a short
 * output preview. No state is owned here — App is the source of truth
 * so history stays immutable after scroll-off.
 *
 * Diff-aware rendering: when outputKind is "diff" or the output
 * contains unified-diff markers, lines are coloured green (+) /
 * red (-) / cyan (@@) to match monorepo patterns.
 */
import * as React from "react";
export type ToolStatus = "pending" | "running" | "done" | "error" | "blocked";
export interface ToolBoxProps {
    name: string;
    status: ToolStatus;
    argSummary?: string;
    outputPreview?: string;
    outputKind?: "text" | "diff";
    durationMs?: number;
    startedAt: number;
}
export declare function ToolBox(props: ToolBoxProps): React.JSX.Element;
