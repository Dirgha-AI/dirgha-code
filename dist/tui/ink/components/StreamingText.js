import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from 'ink';
const BRAND = '#A78BFA';
export function StreamingText({ content }) {
    const { stdout } = useStdout();
    const width = Math.max(20, (stdout?.columns ?? 80) - 6);
    if (content.length === 0)
        return null;
    return (_jsxs(Box, { gap: 2, width: width, marginBottom: 1, children: [_jsx(Text, { color: BRAND, children: "\u2726" }), _jsx(Text, { wrap: "wrap", children: content })] }));
}
//# sourceMappingURL=StreamingText.js.map