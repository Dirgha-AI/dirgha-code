/**
 * SubagentPanel — Shows running sub-agents in a collapsible panel.
 *
 * Monitors the event stream for toolcall_start/toolcall_end events where
 * the tool name is "task" (sub-agent delegation). Displays them as a
 * running list above the prompt.
 */
import * as React from "react";
import type { EventStream } from "../../../kernel/event-stream.js";
interface Props {
    events: EventStream;
}
export declare function SubagentPanel(props: Props): React.JSX.Element | null;
export {};
