/**
 * SubagentDashboard — richer sub-agent lifecycle panel.
 *
 * Monitors the parent event stream for the full sub-agent lifecycle:
 *   toolcall_start -> toolcall_end       (prompt capture)
 *   tool_exec_start -> tool_exec_end     (actual execution)
 *
 * Displays running, completed, and failed sub-agents with
 * prompt label, duration, output summary.
 *
 * A separate component from SubagentPanel so the existing panel
 * can be left in place while this one evolves independently.
 */
import * as React from "react";
import type { EventStream } from "../../../kernel/event-stream.js";
interface Props {
    events: EventStream;
}
export declare function SubagentDashboard(props: Props): React.JSX.Element | null;
export {};
