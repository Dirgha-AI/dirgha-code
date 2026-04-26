import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';
const WIDE_ROWS = [
    '  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ',
    '  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗',
    '  ██║  ██║██║██████╔╝██║  ███╗███████║███████║',
    '  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║',
    '  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║',
    '  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
];
export function Logo({ version }) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    // Logo uses only the 4 palette colours so every theme tints it
    // distinctly — gradient effect is dropped, pick beats per-row noise.
    const ROW_COLOURS = [
        palette.logoB, palette.logoA, palette.brand, palette.accent, palette.brand, palette.borderActive,
    ];
    const BORDER = palette.borderActive;
    const TAG = palette.accent;
    if (cols < 60) {
        return (_jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginBottom: 1, children: [_jsxs(Text, { color: BORDER, children: [_jsx(Text, { color: ROW_COLOURS[0], children: "\u25C6 " }), _jsx(Text, { color: ROW_COLOURS[1], children: "DIRGHA" }), _jsx(Text, { color: BORDER, children: " \u25C6" })] }), _jsxs(Text, { color: TAG, children: ["\u2726 Dirgha Code", ' ', _jsxs(Text, { color: ROW_COLOURS[2], children: ["v", version] }), ' ', "\u2726"] }), _jsx(Text, { color: ROW_COLOURS[3], children: "dirgha.ai \u00B7 /help" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginBottom: 1, children: [_jsx(Text, { color: BORDER, children: '    ╭──────────────────────────────────────────────────────────╮' }), WIDE_ROWS.map((row, i) => {
                const colour = ROW_COLOURS[i] ?? ROW_COLOURS[0];
                return (_jsxs(Text, { color: BORDER, children: ['    │', _jsx(Text, { color: colour, children: row }), '│'] }, i));
            }), _jsx(Text, { color: BORDER, children: '    ╰──────────────────────────────────────────────────────────╯' }), _jsxs(Text, { color: TAG, children: ['    ✦ ', _jsx(Text, { color: ROW_COLOURS[1], children: "Dirgha Code" }), _jsx(Text, { color: ROW_COLOURS[2], children: " \u00B7 " }), _jsx(Text, { color: ROW_COLOURS[3], children: "dirgha.ai" }), ' ✦', _jsx(Text, { color: ROW_COLOURS[5], children: `        v${version}  /help` })] })] }));
}
//# sourceMappingURL=Logo.js.map