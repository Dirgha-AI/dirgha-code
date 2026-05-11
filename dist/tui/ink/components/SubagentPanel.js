import { jsxs as _jsxs } from "react/jsx-runtime";
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
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
export function SubagentPanel(props) {
    const palette = useTheme();
    const [running, setRunning] = React.useState([]);
    React.useEffect(() => {
        const items = new Map();
        const unsub = props.events.subscribe((evt) => {
            if (evt.type === "toolcall_start" && evt.name === "task") {
                items.set(evt.id, { id: evt.id, label: "sub-agent", sub: true });
                setRunning(Array.from(items.values()));
            }
            if (evt.type === "toolcall_end") {
                items.delete(evt.id);
                setRunning(Array.from(items.values()));
            }
            // Fleet agent events (use any cast — FleetEvent is a separate union)
            const f = evt;
            if (f.type === "fleet_agent_start") {
                items.set(f.agentId, {
                    id: f.agentId,
                    label: f.subtask?.title ?? f.agentId,
                    sub: false,
                    status: "running",
                });
                setRunning(Array.from(items.values()));
            }
            if (f.type === "fleet_agent_progress") {
                const existing = items.get(f.agentId);
                if (existing) {
                    existing.status = f.status;
                    items.set(f.agentId, existing);
                    setRunning(Array.from(items.values()));
                }
            }
            if (f.type === "fleet_agent_end") {
                items.delete(f.agentId);
                setRunning(Array.from(items.values()));
            }
        });
        return () => unsub();
    }, [props.events]);
    if (running.length === 0)
        return null;
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginBottom: 0, children: [_jsxs(Text, { color: palette.text.secondary, children: ["agents (", running.length, ")"] }), running.map((s) => (_jsxs(Text, { color: palette.textMuted, children: ["  ", "\uD83D\uDD04 ", s.label] }, s.id)))] }));
}
//# sourceMappingURL=SubagentPanel.js.map