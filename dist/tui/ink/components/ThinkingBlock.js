import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Thinking block: dim italic render of reasoning tokens.
 *
 * Collapsed by default to a char-count summary (`thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Press Enter
 * (Return) on a collapsed block to expand it, Enter again to collapse.
 */
import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";
export function ThinkingBlock({ content, }) {
    const { stdout } = useStdout();
    const width = Math.max(20, (stdout?.columns ?? 80) - 6);
    const [expanded, setExpanded] = React.useState(false);
    useInput((_, key) => {
        if (key.return) {
            setExpanded((prev) => !prev);
        }
    });
    if (content.length === 0)
        return null;
    if (!expanded) {
        return (_jsxs(Box, { gap: 1, marginBottom: 1, children: [_jsx(Text, { color: "gray", dimColor: true, children: "\u280B" }), _jsxs(Text, { color: "gray", dimColor: true, italic: true, children: ["thinking\u2026 (", content.length, " chars \u2014 Enter to expand)"] })] }));
    }
    return (_jsxs(Box, { gap: 2, width: width, marginBottom: 1, children: [_jsx(Text, { color: "gray", dimColor: true, children: "\u280B" }), _jsx(Text, { color: "gray", dimColor: true, italic: true, wrap: "wrap", children: content })] }));
}
//# sourceMappingURL=ThinkingBlock.js.map