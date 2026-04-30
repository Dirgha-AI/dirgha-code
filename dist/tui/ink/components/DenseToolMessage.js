import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Dense (compact) tool-call render.
 *
 * For high-frequency tools where the output is "look at me" rather than
 * "stop and read me" — fs_read, search_grep, search_glob, fs_ls, fs_edit.
 * Renders as a SINGLE indented line with no border:
 *
 *   ✓ Read   src/tui/theme.ts                  42ms
 *   ✓ Grep   "borderStyle"  src/tui/ink/...    18ms  3 matches
 *   ✗ Edit   src/cli/config.ts                  2ms  permission denied
 *
 * Sits flush with surrounding `<ToolGroup>` rows (no own border) so the
 * group's outer bracket reads as one continuous block.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { iconFor, TOOL_STATUS } from "../icons.js";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TOOL_LABEL = {
    fs_read: "Read",
    fs_write: "Write",
    fs_edit: "Edit",
    fs_ls: "List",
    search_grep: "Grep",
    search_glob: "Glob",
    shell: "Shell",
    git: "Git",
    task: "Task",
};
export function DenseToolMessage(props) {
    const palette = useTheme();
    const [frame, setFrame] = React.useState(0);
    React.useEffect(() => {
        if (props.status !== "running")
            return;
        const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
        return () => clearInterval(t);
    }, [props.status]);
    const glyph = props.status === "error"
        ? TOOL_STATUS.ERROR
        : props.status === "done"
            ? TOOL_STATUS.SUCCESS
            : SPINNER[frame];
    const glyphColour = props.status === "error"
        ? palette.status.error
        : props.status === "done"
            ? palette.status.success
            : palette.status.warning;
    const nameColour = props.status === "done"
        ? palette.text.secondary
        : props.status === "error"
            ? palette.status.error
            : palette.text.primary;
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        if (props.status !== "running")
            return;
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, [props.status]);
    const liveMs = props.status === "running" && props.startedAt
        ? now - props.startedAt
        : undefined;
    const elapsed = formatElapsed(liveMs ?? props.durationMs ?? 0);
    const summary = props.outputPreview
        ? props.outputPreview.replace(/\s+/g, " ").slice(0, 60)
        : "";
    const label = TOOL_LABEL[props.name] ?? props.name.replace(/_/g, " ");
    return (_jsxs(Box, { paddingLeft: 2, flexDirection: "row", children: [_jsx(Box, { minWidth: 2, children: _jsx(Text, { color: glyphColour, bold: props.status !== "running", children: glyph }) }), _jsx(Text, { color: palette.text.accent, children: iconFor(props.name) }), _jsx(Text, { children: " " }), _jsx(Text, { bold: true, color: nameColour, children: label }), props.argSummary && props.argSummary.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { children: " " }), _jsx(Text, { color: palette.text.secondary, children: props.argSummary })] })), props.durationMs !== undefined && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "  " }), _jsx(Text, { color: palette.text.secondary, dimColor: true, children: elapsed })] })), summary && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "  " }), _jsx(Text, { color: palette.text.secondary, dimColor: true, children: summary })] }))] }));
}
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
/** Tools that should render compactly (single line, no border) by default. */
const DENSE_TOOLS = new Set([
    "fs_read",
    "fs_ls",
    "fs_edit",
    "search_grep",
    "search_glob",
    "git",
    "git_commit",
]);
export function isDenseTool(name) {
    return DENSE_TOOLS.has(name);
}
//# sourceMappingURL=DenseToolMessage.js.map