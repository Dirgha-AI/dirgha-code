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
import { SpinnerContext } from "../spinner-context.js";
import { SpinnerGlyph } from "./SpinnerGlyph.js";
import { useElapsed } from "../use-elapsed.js";
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
export const DenseToolMessage = React.memo(function DenseToolMessage(props) {
    const palette = useTheme();
    const { busy } = React.useContext(SpinnerContext);
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
    const liveElapsed = useElapsed(props.startedAt ?? 0);
    const elapsed = props.status === "running" && props.startedAt
        ? liveElapsed
        : formatElapsed(props.durationMs ?? 0);
    const summary = props.outputPreview
        ? props.outputPreview.replace(/\s+/g, " ").slice(0, 60)
        : "";
    const label = TOOL_LABEL[props.name] ?? props.name.replace(/_/g, " ");
    const isRunning = props.status === "running";
    return (_jsxs(Box, { paddingLeft: 2, flexDirection: "row", children: [_jsx(Box, { minWidth: 2, children: isRunning ? (_jsx(SpinnerGlyph, { isActive: busy, color: glyphColour })) : (_jsx(Text, { color: glyphColour, bold: !isRunning, children: props.status === "error" ? TOOL_STATUS.ERROR : TOOL_STATUS.SUCCESS })) }), _jsx(Text, { color: palette.text.accent, children: iconFor(props.name) }), _jsx(Text, { children: " " }), _jsx(Text, { bold: true, color: nameColour, children: label }), props.argSummary && props.argSummary.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { children: " " }), _jsx(Text, { color: palette.text.secondary, children: props.argSummary })] })), props.durationMs !== undefined && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "  " }), _jsx(Text, { color: palette.text.secondary, dimColor: true, children: elapsed })] })), summary && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "  " }), _jsx(Text, { color: palette.text.secondary, dimColor: true, children: summary })] }))] }));
});
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