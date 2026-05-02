import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Connected-border tool group — gemini-cli pattern.
 *
 * Wraps a sequence of consecutive tool calls of one assistant turn in
 * ONE bordered region (instead of dirgha's old "round box per call").
 * The bracket reads as a single visual unit; individual tool rows
 * stack inside without their own borders.
 *
 * Compact (dense) tools render as flush single lines with no border
 * chrome — they break out of the bracket the same way gemini's
 * DenseToolMessage does. Heavy tools (shell, write, agent) render
 * with name + arg summary at the top, output preview below, all
 * inside the connected region.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { iconFor, TOOL_STATUS } from "../icons.js";
import { DenseToolMessage, isDenseTool } from "./DenseToolMessage.js";
import { SpinnerContext, SPINNER_FRAMES as SPINNER } from "../spinner-context.js";
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
export function ToolGroup(props) {
    const palette = useTheme();
    if (props.tools.length === 0)
        return null;
    // Border colour follows the most-severe state: error > running > done.
    const groupColour = pickGroupColour(props.tools, palette);
    const isDimmed = props.tools.every((t) => t.status === "done");
    return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsx(Box, { borderStyle: "round", borderColor: groupColour, borderDimColor: isDimmed, paddingX: 1, flexDirection: "column", children: props.tools.map((tool, idx) => {
                const isLast = idx === props.tools.length - 1;
                if (isDenseTool(tool.name)) {
                    return (_jsx(Box, { marginBottom: isLast ? 0 : 0, children: _jsx(DenseToolMessage, { name: tool.name, status: tool.status, argSummary: tool.argSummary, outputPreview: tool.outputPreview, durationMs: tool.durationMs, startedAt: tool.startedAt }) }, tool.id));
                }
                return (_jsx(FullToolRow, { tool: tool, divider: !isLast, palette: palette }, tool.id));
            }) }) }));
}
function FullToolRow({ tool, divider, palette, }) {
    const frame = React.useContext(SpinnerContext);
    const glyph = tool.status === "error"
        ? TOOL_STATUS.ERROR
        : tool.status === "done"
            ? TOOL_STATUS.SUCCESS
            : SPINNER[frame];
    const glyphColour = tool.status === "error"
        ? palette.status.error
        : tool.status === "done"
            ? palette.status.success
            : palette.status.warning;
    const nameColour = tool.status === "done"
        ? palette.text.secondary
        : tool.status === "error"
            ? palette.status.error
            : palette.text.primary;
    const elapsed = tool.durationMs !== undefined
        ? formatElapsed(tool.durationMs)
        : tool.status === "running"
            ? formatElapsed(Date.now() - tool.startedAt)
            : "";
    const label = TOOL_LABEL[tool.name] ?? tool.name.replace(/_/g, " ");
    const diffMode = tool.outputKind === "diff" ||
        (tool.outputPreview !== undefined &&
            /^[+-]|^@@\s/m.test(tool.outputPreview));
    const preview = !diffMode && tool.outputPreview
        ? tool.outputPreview.replace(/\s+/g, " ").slice(0, 200)
        : "";
    const diffLines = diffMode && tool.outputPreview
        ? tool.outputPreview.split("\n").slice(0, 30)
        : [];
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Box, { minWidth: 2, children: _jsx(Text, { color: glyphColour, bold: tool.status !== "running", children: glyph }) }), _jsx(Text, { color: palette.text.accent, children: iconFor(tool.name) }), _jsx(Text, { children: " " }), _jsx(Text, { bold: true, color: nameColour, children: label }), tool.argSummary && tool.argSummary.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { children: " " }), _jsx(Text, { color: palette.text.secondary, children: tool.argSummary })] })), elapsed && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "  " }), _jsx(Text, { color: palette.text.secondary, dimColor: true, children: elapsed })] }))] }), preview && (_jsx(Box, { paddingLeft: 4, children: _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["\u23BF ", preview] }) })), diffLines.length > 0 && (_jsx(Box, { paddingLeft: 4, flexDirection: "column", children: diffLines.map((line, i) => {
                    let colour;
                    if (line.startsWith("+") && !line.startsWith("+++"))
                        colour = DIFF_ADD_COLOUR;
                    else if (line.startsWith("-") && !line.startsWith("---"))
                        colour = DIFF_DEL_COLOUR;
                    else if (/^@@\s/.test(line))
                        colour = DIFF_HUNK_COLOUR;
                    return (_jsx(Box, { flexDirection: "row", children: _jsx(Text, { color: colour, dimColor: !colour, children: line || " " }) }, i));
                }) })), divider && (_jsx(Box, { children: _jsx(Text, { color: palette.border.default, dimColor: true, children: " " }) }))] }));
}
function pickGroupColour(tools, palette) {
    if (tools.some((t) => t.status === "error"))
        return palette.status.error;
    if (tools.some((t) => t.status === "running"))
        return palette.ui.focus;
    return palette.border.default;
}
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
//# sourceMappingURL=ToolGroup.js.map