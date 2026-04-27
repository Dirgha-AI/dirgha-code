import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Modal overlay for picking a theme palette.
 *
 * Mirrors ModelPicker's interaction grammar so muscle memory carries
 * across both pickers: arrow keys move the cursor, Enter selects,
 * Esc / `q` cancels, digit keys 1-9 jump to a row.
 *
 * Each row renders three colour swatches drawn from that theme's
 * palette (brand · accent · borderActive) so the user can see what
 * they'll get before they pick.
 */
import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { PALETTES } from '../../theme.js';
import { useTheme } from '../theme-context.js';
export function ThemePicker(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 4, 60);
    const themeNames = React.useMemo(() => Object.keys(PALETTES), []);
    const initial = Math.max(0, themeNames.indexOf(props.current));
    const [cursor, setCursor] = React.useState(initial);
    useInput((ch, key) => {
        if (key.escape || ch === 'q') {
            props.onCancel();
            return;
        }
        if (key.upArrow || ch === 'k') {
            setCursor(c => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow || ch === 'j') {
            setCursor(c => Math.min(themeNames.length - 1, c + 1));
            return;
        }
        if (key.return) {
            const picked = themeNames[cursor];
            if (picked)
                props.onPick(picked);
            return;
        }
        if (ch && /^[1-9]$/.test(ch)) {
            const n = Number(ch) - 1;
            const picked = themeNames[n];
            if (picked)
                props.onPick(picked);
        }
    }, { isActive: true });
    const selected = themeNames[cursor] ?? props.current;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.accent, paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { color: palette.accent, bold: true, children: "theme picker" }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u2191\u2193 enter \u00B7 1-9 \u00B7 esc" })] }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: themeNames.map((name, i) => {
                    const p = PALETTES[name];
                    const isCursor = i === cursor;
                    const isCurrent = name === props.current;
                    const prefix = isCursor ? '>' : isCurrent ? '•' : ' ';
                    const num = i < 9 ? String(i + 1) : ' ';
                    return (_jsxs(Box, { gap: 1, paddingLeft: 1, children: [_jsx(Text, { color: isCursor ? palette.accent : palette.textMuted, children: prefix }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: num }), _jsx(Box, { width: 16, children: _jsx(Text, { color: isCursor ? palette.textPrimary : isCurrent ? palette.accent : palette.textMuted, bold: isCursor, children: name }) }), _jsx(Text, { color: p.brand, children: "\u2588\u2588\u2588" }), _jsx(Text, { color: p.accent, children: "\u2588\u2588\u2588" }), _jsx(Text, { color: p.borderActive, children: "\u2588\u2588\u2588" })] }, name));
                }) }), _jsx(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: palette.borderIdle, children: _jsxs(Box, { gap: 1, children: [_jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u2192" }), _jsx(Text, { color: palette.accent, children: selected })] }) })] }));
}
//# sourceMappingURL=ThemePicker.js.map