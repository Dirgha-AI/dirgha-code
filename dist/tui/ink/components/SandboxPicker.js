import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Modal overlay for the sandbox-mode toggle.
 *
 * Same interaction grammar as ThemePicker / ModelPicker — arrow keys
 * move the cursor, Enter selects, Esc / `q` cancels, digits 1-3 jump.
 *
 * Each row shows the mode name + a one-line description so the user
 * sees the trade-off (filesystem confinement, network policy) at the
 * point of choosing.
 */
import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTheme } from "../theme-context.js";
const MODES = [
    {
        id: "off",
        label: "off",
        description: "Tools run with user privileges. Default. No containment.",
    },
    {
        id: "auto",
        label: "auto",
        description: "shell/git/lsp confined to cwd via platform sandbox. Network allowed (npm install / git pull work).",
    },
    {
        id: "strict",
        label: "strict",
        description: "cwd-only writes + network blocked. Catches exfiltration and curl|sh attacks. Power-user opt-in.",
    },
];
export function SandboxPicker(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 4, 72);
    const initial = Math.max(0, MODES.findIndex((m) => m.id === props.current));
    const [cursor, setCursor] = React.useState(initial);
    useInput((ch, key) => {
        if (key.escape || ch === "q") {
            props.onCancel();
            return;
        }
        if (key.upArrow || ch === "k") {
            setCursor((c) => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow || ch === "j") {
            setCursor((c) => Math.min(MODES.length - 1, c + 1));
            return;
        }
        if (key.return) {
            const picked = MODES[cursor];
            if (picked)
                props.onPick(picked.id);
            return;
        }
        if (ch && /^[1-3]$/.test(ch)) {
            const picked = MODES[Number(ch) - 1];
            if (picked)
                props.onPick(picked.id);
        }
    }, { isActive: true });
    const selected = MODES[cursor]?.id ?? props.current;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.accent, paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { color: palette.accent, bold: true, children: "sandbox picker" }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u2191\u2193 enter \u00B7 1-3 \u00B7 esc" })] }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: MODES.map((m, i) => {
                    const isCursor = i === cursor;
                    const isCurrent = m.id === props.current;
                    const prefix = isCursor ? ">" : isCurrent ? "•" : " ";
                    const num = String(i + 1);
                    return (_jsx(Box, { flexDirection: "column", paddingLeft: 1, children: _jsxs(Box, { gap: 1, children: [_jsx(Text, { color: isCursor ? palette.accent : palette.textMuted, children: prefix }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: num }), _jsx(Box, { width: 9, children: _jsx(Text, { color: isCursor
                                            ? palette.textPrimary
                                            : isCurrent
                                                ? palette.accent
                                                : palette.textMuted, bold: isCursor, children: m.label }) }), _jsx(Text, { color: isCursor ? palette.textPrimary : palette.textMuted, dimColor: !isCursor, children: m.description })] }) }, m.id));
                }) }), _jsx(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: palette.borderIdle, children: _jsxs(Box, { gap: 1, children: [_jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u2192" }), _jsx(Text, { color: palette.accent, children: selected }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: "(writes to ~/.dirgha/config.json)" })] }) })] }));
}
//# sourceMappingURL=SandboxPicker.js.map