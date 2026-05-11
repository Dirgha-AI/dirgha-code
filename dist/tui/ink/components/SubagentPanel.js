import { jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SubagentPanel — Shows running sub-agents in a collapsible panel.
 *
 * Monitors the event stream for toolcall_start/toolcall_end events where
 * the tool name is "task" (sub-agent delegation). Displays them as a
 * running list above the prompt.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
export function SubagentPanel(props) {
    const palette = useTheme();
    const [running, setRunning] = React.useState([]);
    React.useEffect(() => {
        const subs = new Map(); // id → name
        const unsub = props.events.subscribe((evt) => {
            if (evt.type === "toolcall_start" && evt.name === "task") {
                subs.set(evt.id, evt.name);
                setRunning(Array.from(subs.entries()).map(([id, name]) => ({ id, name })));
            }
            if (evt.type === "toolcall_end") {
                subs.delete(evt.id);
                setRunning(Array.from(subs.entries()).map(([id, name]) => ({ id, name })));
            }
        });
        return () => unsub();
    }, [props.events]);
    if (running.length === 0)
        return null;
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginBottom: 0, children: [_jsxs(Text, { color: palette.text.secondary, children: ["sub-agents (", running.length, ")"] }), running.map((s) => (_jsxs(Text, { color: palette.textMuted, children: ["  ", "\uD83D\uDD04 sub-agent"] }, s.id)))] }));
}
//# sourceMappingURL=SubagentPanel.js.map