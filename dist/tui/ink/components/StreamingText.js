import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';
import { MarkdownDisplay } from '../markdown/index.js';
const PREFIX = '✦';
const PREFIX_WIDTH = 2;
export function StreamingText({ content }) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const contentWidth = Math.max(20, cols - PREFIX_WIDTH - 2);
    if (content.length === 0)
        return null;
    return (_jsxs(Box, { flexDirection: "row", marginBottom: 1, children: [_jsx(Box, { width: PREFIX_WIDTH, children: _jsx(Text, { color: palette.text.accent, children: PREFIX }) }), _jsx(Box, { flexGrow: 1, flexDirection: "column", children: _jsx(MarkdownDisplay, { text: content, palette: palette, width: contentWidth }) })] }));
}
//# sourceMappingURL=StreamingText.js.map