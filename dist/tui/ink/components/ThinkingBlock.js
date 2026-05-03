import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Thinking block: collapsible render of reasoning tokens.
 *
 * Collapsed by default to a one-line summary (`∇ thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Press Enter
 * or Space to toggle. Auto-expands during active streaming and
 * auto-collapses when the thinking span ends.
 *
 * ThinkingBlockGroup wraps 3+ consecutive thinking blocks in a single
 * collapsible accordion row.
 */
import * as React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme-context.js";
import { TRANSCRIPT_GLYPHS } from "../icons.js";
export const ThinkingBlock = React.memo(function ThinkingBlock({ content, isStreaming = false, }) {
    const palette = useTheme();
    const [collapsed, setCollapsed] = React.useState(true);
    React.useEffect(() => {
        if (isStreaming) {
            setCollapsed(false);
        }
        else {
            setCollapsed(true);
        }
    }, [isStreaming]);
    useInput((input, key) => {
        if ((key.return || input === " ") && !isStreaming) {
            setCollapsed((prev) => !prev);
        }
    }, { isActive: true });
    if (content.length === 0 && !isStreaming)
        return null;
    if (collapsed) {
        return (_jsxs(Box, { gap: 1, marginBottom: 1, children: [_jsx(Text, { color: palette.text.secondary, dimColor: true, children: TRANSCRIPT_GLYPHS.thinking }), _jsxs(Text, { color: palette.text.secondary, dimColor: true, italic: true, children: ["thinking\u2026", content.length > 0
                            ? ` (${content.length} chars — Enter/Space to expand)`
                            : ""] })] }));
    }
    return (_jsxs(Box, { flexDirection: "row", marginBottom: 1, children: [_jsx(Box, { width: 2, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: TRANSCRIPT_GLYPHS.thinking }) }), _jsx(Box, { flexGrow: 1, flexDirection: "column", children: _jsx(Text, { color: palette.text.secondary, dimColor: true, italic: true, wrap: "wrap", children: content || "thinking…" }) })] }));
});
export const ThinkingBlockGroup = React.memo(function ThinkingBlockGroup({ blocks, }) {
    const palette = useTheme();
    const [collapsed, setCollapsed] = React.useState(true);
    useInput((input, key) => {
        if (key.return || input === " ") {
            setCollapsed((prev) => !prev);
        }
    }, { isActive: true });
    const totalChars = blocks.reduce((sum, b) => sum + b.content.length, 0);
    if (collapsed) {
        return (_jsxs(Box, { gap: 1, marginBottom: 1, children: [_jsx(Text, { color: palette.text.secondary, dimColor: true, children: TRANSCRIPT_GLYPHS.thinking }), _jsxs(Text, { color: palette.text.secondary, dimColor: true, italic: true, children: ["thinking (", blocks.length, " blocks, ", totalChars, " chars \u2014 Enter/Space to expand)"] })] }));
    }
    return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: blocks.map((block, i) => (_jsxs(Box, { flexDirection: "row", marginBottom: i < blocks.length - 1 ? 0 : 0, children: [_jsx(Box, { width: 2, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: TRANSCRIPT_GLYPHS.thinking }) }), _jsx(Box, { flexGrow: 1, flexDirection: "column", children: _jsx(Text, { color: palette.text.secondary, dimColor: true, italic: true, wrap: "wrap", children: block.content }) })] }, block.id))) }));
});
//# sourceMappingURL=ThinkingBlock.js.map