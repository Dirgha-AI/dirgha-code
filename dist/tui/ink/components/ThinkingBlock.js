import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from 'ink';
export function ThinkingBlock({ content, expanded = false }) {
    const { stdout } = useStdout();
    const width = Math.max(20, (stdout?.columns ?? 80) - 6);
    if (content.length === 0)
        return null;
    if (!expanded) {
        return (_jsxs(Box, { gap: 1, marginBottom: 1, children: [_jsx(Text, { color: "gray", dimColor: true, children: "\u280B" }), _jsxs(Text, { color: "gray", dimColor: true, italic: true, children: ["thinking\u2026 (", content.length, " chars)"] })] }));
    }
    return (_jsxs(Box, { gap: 2, width: width, marginBottom: 1, children: [_jsx(Text, { color: "gray", dimColor: true, children: "\u280B" }), _jsx(Text, { color: "gray", dimColor: true, italic: true, wrap: "wrap", children: content })] }));
}
//# sourceMappingURL=ThinkingBlock.js.map