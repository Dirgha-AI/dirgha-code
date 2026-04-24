import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from 'ink';
const WIDE_ROWS = [
    '  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ',
    '  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗',
    '  ██║  ██║██║██████╔╝██║  ███╗███████║███████║',
    '  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║',
    '  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║',
    '  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
];
const ROW_COLOURS = [
    '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6',
];
const BORDER = '#5B21B6';
const TAG = '#A78BFA';
export function Logo({ version }) {
    const { stdout } = useStdout();
    const cols = stdout?.columns ?? 80;
    if (cols < 60) {
        return (_jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginBottom: 1, children: [_jsxs(Text, { color: BORDER, children: [_jsx(Text, { color: ROW_COLOURS[0], children: "\u25C6 " }), _jsx(Text, { color: ROW_COLOURS[1], children: "DIRGHA" }), _jsx(Text, { color: BORDER, children: " \u25C6" })] }), _jsxs(Text, { color: TAG, children: ["\u2726 Dirgha Code", ' ', _jsxs(Text, { color: ROW_COLOURS[2], children: ["v", version] }), ' ', "\u2726"] }), _jsx(Text, { color: ROW_COLOURS[3], children: "dirgha.ai \u00B7 /help" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginBottom: 1, children: [_jsx(Text, { color: BORDER, children: '    ╭──────────────────────────────────────────────────────────╮' }), WIDE_ROWS.map((row, i) => {
                const colour = ROW_COLOURS[i] ?? ROW_COLOURS[0];
                return (_jsxs(Text, { color: BORDER, children: ['    │', _jsx(Text, { color: colour, children: row }), '│'] }, i));
            }), _jsx(Text, { color: BORDER, children: '    ╰──────────────────────────────────────────────────────────╯' }), _jsxs(Text, { color: TAG, children: ['    ✦ ', _jsx(Text, { color: ROW_COLOURS[1], children: "Dirgha Code" }), _jsx(Text, { color: ROW_COLOURS[2], children: " \u00B7 " }), _jsx(Text, { color: ROW_COLOURS[3], children: "dirgha.ai" }), ' ✦', _jsx(Text, { color: ROW_COLOURS[5], children: `        v${version}  /help` })] })] }));
}
//# sourceMappingURL=Logo.js.map