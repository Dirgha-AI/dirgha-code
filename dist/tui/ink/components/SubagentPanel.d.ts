/**
 * SubagentPanel — Shows running sub-agents and fleet agents.
 *
 * Monitors the event stream for:
 *   - toolcall_start/end (sub-agent delegation)
 *   - fleet_agent_start/progress/end (parallel fleet agents)
 *
 * Displays them as a running list above the prompt.
 */
import * as React from "react";
import type { EventStream } from "../../../kernel/event-stream.js";
interface Props {
    events: EventStream;
}
export declare function SubagentPanel(props: Props): React.JSX.Element | null;
export {};
