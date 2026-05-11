import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * GoalIndicator — Shows the persistent goal above the task list.
 *
 * Polls ~/.dirgha/goal.json every 3s. Only renders when a goal is set.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { getGoal } from "../../../context/goal.js";
const POLL_MS = 3_000;
export function GoalIndicator() {
    const palette = useTheme();
    const [goal, setGoal] = React.useState(null);
    React.useEffect(() => {
        function poll() {
            getGoal()
                .then((g) => setGoal(g))
                .catch(() => { });
        }
        poll();
        const iv = setInterval(poll, POLL_MS);
        return () => clearInterval(iv);
    }, []);
    if (!goal)
        return null;
    const icon = goal.status === "done" ? "✅" :
        goal.status === "paused" ? "⏸" : "🎯";
    const barW = 30;
    const filled = Math.round((goal.progress / 100) * barW);
    const bar = "█".repeat(filled) + "░".repeat(barW - filled);
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginBottom: 0, children: [_jsx(Box, { children: _jsxs(Text, { color: palette.text.primary, bold: true, children: [icon, " ", goal.title] }) }), _jsx(Box, { marginLeft: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: palette.text.secondary, children: bar }), _jsxs(Text, { color: palette.text.secondary, children: [" ", goal.progress, "%"] }), goal.status === "paused" && _jsx(Text, { color: palette.status.warning, children: " (paused)" })] }) })] }));
}
//# sourceMappingURL=GoalIndicator.js.map