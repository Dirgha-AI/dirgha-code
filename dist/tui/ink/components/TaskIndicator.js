import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * TaskIndicator — Persistent task status panel for the TUI.
 *
 * Reads ~/.dirgha/tasks.json and shows active (non-done, non-cancelled)
 * tasks with progress bars. Sits above the PromptQueueIndicator.
 *
 * Polls the file every 2s so agent-side task_create/task_update calls
 * appear live in the UI without requiring a full re-render pipeline.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { listTasks } from "../../../context/tasks.js";
const POLL_MS = 2_000;
const MAX_VISIBLE = 5;
export function TaskIndicator() {
    const palette = useTheme();
    const [tasks, setTasks] = React.useState([]);
    React.useEffect(() => {
        function poll() {
            listTasks()
                .then((all) => {
                // Show only active (non-terminal) tasks
                const active = all.filter((t) => t.status !== "done" && t.status !== "cancelled");
                setTasks(active);
            })
                .catch(() => { });
        }
        poll();
        const iv = setInterval(poll, POLL_MS);
        return () => clearInterval(iv);
    }, []);
    if (tasks.length === 0)
        return null;
    const visible = tasks.slice(0, MAX_VISIBLE);
    const overflow = Math.max(0, tasks.length - MAX_VISIBLE);
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginBottom: 0, children: [_jsxs(Text, { color: palette.text.primary, bold: true, children: ["Tasks (", tasks.length, " active)"] }), visible.map((t) => (_jsx(TaskRow, { task: t, palette: palette }, t.id))), overflow > 0 && (_jsxs(Text, { color: palette.textMuted, dimColor: true, children: ["  ", "+", overflow, " more"] }))] }));
}
function TaskRow({ task, palette, }) {
    const icon = task.status === "in_progress"
        ? "🔄"
        : task.status === "blocked"
            ? "🚫"
            : "⏳";
    const label = `${icon} [${task.id.slice(0, 8)}] ${task.title}`;
    // Show a simple progress bar for in_progress tasks
    const hasProgress = task.status === "in_progress" && task.progress !== undefined;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: palette.text.primary, children: ["  ", label] }), hasProgress && (_jsx(Box, { marginLeft: 4, children: _jsx(ProgressBar, { value: task.progress }) }))] }));
}
function ProgressBar({ value, }) {
    const barW = 20;
    const filled = Math.round((value / 100) * barW);
    const empty = barW - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return (_jsxs(Text, { children: [bar, " ", value, "%"] }));
}
//# sourceMappingURL=TaskIndicator.js.map