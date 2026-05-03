import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Thinking block — Gemini CLI-style always-visible reasoning display.
 *
 * Thinking content is shown as a clean bubble: first line is a bold
 * summary heading, the remainder is in a left-bordered italic block.
 * Always visible — no toggle/collapse. During streaming the heading
 * updates live; after streaming the block stays visible for context.
 *
 * ThinkingBlockGroup merges 3+ consecutive blocks into single grouped rows.
 */
import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
function splitContent(content) {
    const lines = content.trim().split("\n");
    if (lines.length <= 1)
        return { summary: "", body: content.trim() };
    return {
        summary: lines[0].trim(),
        body: lines.slice(1).join("\n").trim(),
    };
}
export const ThinkingBlock = React.memo(function ThinkingBlock({ content, }) {
    const palette = useTheme();
    if (!content)
        return null;
    const { summary, body } = splitContent(content);
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, paddingLeft: 1, children: [summary.length > 0 && (_jsx(Box, { paddingLeft: 2, marginBottom: body.length > 0 ? 0 : 0, children: _jsx(Text, { color: palette.text.primary, bold: true, italic: true, children: summary }) })), body.length > 0 && (_jsx(Box, { borderStyle: "single", borderLeft: true, borderRight: false, borderTop: false, borderBottom: false, borderColor: palette.border.default, paddingLeft: 1, marginLeft: 2, children: _jsx(Text, { color: palette.text.secondary, italic: true, wrap: "wrap", children: body }) })), summary.length === 0 && body.length === 0 && (_jsx(Text, { color: palette.text.secondary, italic: true, children: content }))] }));
});
export const ThinkingBlockGroup = React.memo(function ThinkingBlockGroup({ blocks, }) {
    const palette = useTheme();
    if (blocks.length === 0)
        return null;
    // One block with content — delegate to ThinkingBlock.
    if (blocks.length === 1) {
        return _jsx(ThinkingBlock, { content: blocks[0].content });
    }
    return (_jsx(Box, { flexDirection: "column", marginBottom: 1, paddingLeft: 1, children: blocks.map((block, i) => {
            const { summary, body } = splitContent(block.content);
            return (_jsxs(Box, { flexDirection: "column", children: [summary.length > 0 && (_jsx(Box, { paddingLeft: 2, marginBottom: body.length > 0 ? 0 : 0, children: _jsx(Text, { color: palette.text.primary, bold: true, italic: true, children: summary }) })), body.length > 0 && (_jsx(Box, { borderStyle: "single", borderLeft: true, borderRight: false, borderTop: false, borderBottom: false, borderColor: palette.colors.border ?? palette.border.default ?? "#444", paddingLeft: 1, marginLeft: 2, marginBottom: i < blocks.length - 1 ? 1 : 0, children: _jsx(Text, { color: palette.text.secondary, italic: true, wrap: "wrap", children: body }) }))] }, block.id));
        }) }));
});
//# sourceMappingURL=ThinkingBlock.js.map