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
const SPINNER_FRAMES = [
    "⠋",
    "⠙",
    "⠹",
    "⠸",
    "⠼",
    "⠴",
    "⠦",
    "⠧",
    "⠇",
    "⠏",
];
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
    const [frame, setFrame] = React.useState(0);
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => {
        if (props.status !== "running")
            return;
        const t = setInterval(() => {
            setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
            setTick((n) => n + 1);
        }, 80);
        return () => clearInterval(t);
    }, [props.status]);
    const icon = props.status === "error"
        ? "✗"
        : props.status === "done"
            ? "✓"
            : SPINNER_FRAMES[frame];
    const iconColour = props.status === "error"
        ? palette.error
        : props.status === "done"
            ? palette.brand
            : palette.brand;
    const borderColour = props.status === "error"
        ? palette.error
        : props.status === "done"
            ? palette.borderIdle
            : palette.brand;
    const elapsedLabel = props.status === "running"
        ? formatElapsed(Date.now() - props.startedAt)
        : props.durationMs !== undefined
            ? formatElapsed(props.durationMs)
            : "";
    void tick;
    const diffMode = isDiffOutput(props);
    const preview = !diffMode && props.outputPreview
        ? props.outputPreview.replace(/\s+/g, " ").slice(0, 80)
        : diffMode && props.outputPreview
            ? diffShortPreview(props.outputPreview, 80)
            : "";
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: borderColour, paddingX: 1, marginBottom: 1, children: [_jsxs(Box, { gap: 1, children: [_jsx(Text, { color: iconColour, children: icon }), _jsx(Text, { color: palette.accent, bold: true, children: iconFor(props.name) }), _jsx(Text, { color: props.status === "done" ? palette.textMuted : palette.textPrimary, bold: true, children: prettyName(props.name) }), props.argSummary !== undefined && props.argSummary.length > 0 && (_jsxs(Text, { color: palette.textMuted, dimColor: true, children: ["(", props.argSummary, ")"] })), elapsedLabel !== "" && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: elapsedLabel }))] }), preview !== "" && !diffMode && (_jsx(Box, { children: _jsx(Text, { color: palette.textMuted, dimColor: true, children: preview }) })), diffMode && props.outputPreview && (_jsx(Box, { flexDirection: "column", children: renderDiffLines(props.outputPreview, 30) }))] }));
}
//# sourceMappingURL=ToolBox.js.map