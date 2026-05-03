import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { Box, Text } from "ink";
import { iconFor } from "../icons.js";
import { useTheme } from "../theme-context.js";
import { SpinnerContext } from "../spinner-context.js";
import { SpinnerGlyph } from "./SpinnerGlyph.js";
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
const DIFF_ADD_COLOUR = "#50fa7b";
const DIFF_DEL_COLOUR = "#ff5555";
const DIFF_HUNK_COLOUR = "#00ffff";
function prettyName(name) {
    return TOOL_LABEL[name] ?? name.replace(/_/g, " ");
}
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function hasDiffMarkers(text) {
    return /^[+-]|^@@\s/m.test(text);
}
function isDiffOutput(props) {
    if (props.outputKind === "diff")
        return true;
    if (props.outputPreview && hasDiffMarkers(props.outputPreview))
        return true;
    return false;
}
function renderDiffLines(text, limit) {
    const lines = text.split("\n").slice(0, limit);
    return lines.map((line, i) => {
        let colour;
        if (line.startsWith("+") && !line.startsWith("+++"))
            colour = DIFF_ADD_COLOUR;
        else if (line.startsWith("-") && !line.startsWith("---"))
            colour = DIFF_DEL_COLOUR;
        else if (/^@@\s/.test(line))
            colour = DIFF_HUNK_COLOUR;
        return (_jsx(Box, { flexDirection: "row", children: _jsx(Text, { color: colour, dimColor: !colour, children: line || " " }) }, i));
    });
}
/** Short single-line preview for collapsed diff output. */
function diffShortPreview(text, maxLen = 80) {
    const first = text
        .split("\n")
        .find((l) => l.startsWith("+") || l.startsWith("-"));
    if (!first)
        return text.replace(/\s+/g, " ").slice(0, maxLen);
    return first.replace(/\s+/g, " ").slice(0, maxLen) + "\u2026";
}
export function ToolBox(props) {
    const palette = useTheme();
    const { busy: _spinnerBusy } = React.useContext(SpinnerContext);
    const isRunning = props.status !== "done" &&
        props.status !== "error" &&
        props.status !== "blocked";
    const icon = props.status === "error"
        ? "✗"
        : props.status === "done"
            ? "✓"
            : props.status === "blocked"
                ? "○"
                : null;
    const iconColour = props.status === "error"
        ? palette.status.error
        : props.status === "blocked"
            ? palette.status.warning
            : palette.ui.focus;
    const borderColour = props.status === "error"
        ? palette.status.error
        : props.status === "blocked"
            ? palette.status.warning
            : props.status === "done"
                ? palette.border.default
                : palette.ui.focus;
    const elapsedLabel = props.status === "blocked"
        ? ""
        : props.status === "running"
            ? formatElapsed(Date.now() - props.startedAt)
            : props.durationMs !== undefined
                ? formatElapsed(props.durationMs)
                : "";
    const diffMode = isDiffOutput(props);
    const preview = !diffMode && props.outputPreview
        ? props.outputPreview.replace(/\s+/g, " ").slice(0, 80)
        : diffMode && props.outputPreview
            ? diffShortPreview(props.outputPreview, 80)
            : "";
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: borderColour, paddingX: 1, marginBottom: 1, children: [_jsxs(Box, { gap: 1, children: [icon !== null ? (_jsx(Text, { color: iconColour, children: icon })) : (_jsx(SpinnerGlyph, { isActive: isRunning })), _jsx(Text, { color: palette.text.accent, bold: true, children: iconFor(props.name) }), _jsx(Text, { color: props.status === "done" || props.status === "blocked"
                            ? palette.text.secondary
                            : palette.text.primary, bold: props.status !== "blocked", dimColor: props.status === "blocked", children: prettyName(props.name) }), props.argSummary !== undefined && props.argSummary.length > 0 && (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["(", props.argSummary, ")"] })), elapsedLabel !== "" && (_jsx(Text, { color: palette.text.secondary, dimColor: true, children: elapsedLabel })), props.status === "blocked" && (_jsx(Text, { color: palette.status.warning, children: "(blocked)" }))] }), preview !== "" && !diffMode && (_jsx(Box, { children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: preview }) })), diffMode && props.outputPreview && (_jsx(Box, { flexDirection: "column", children: renderDiffLines(props.outputPreview, 30) }))] }));
}
//# sourceMappingURL=ToolBox.js.map