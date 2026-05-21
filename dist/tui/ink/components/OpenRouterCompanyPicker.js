import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Third step in the OpenRouter picker flow:
 *   ProviderPicker → OpenRouterCompanyPicker → ModelPicker (filtered)
 *
 * Lists upstream company prefixes available on OpenRouter so the user
 * can narrow the model list before seeing hundreds of entries.
 *
 * Keys: ↑↓ / k j / ctrl+p ctrl+n  navigate
 *       1-9   jump
 *       enter pick → opens ModelPicker filtered to this company
 *       esc   go back to ProviderPicker
 *       type  fuzzy-filter the company names
 */
import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTheme } from "../theme-context.js";
export function OpenRouterCompanyPicker(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const width = Math.max(40, cols - 4);
    const [filter, setFilter] = React.useState("");
    const filtered = React.useMemo(() => {
        if (!filter)
            return props.companies;
        const needle = filter.toLowerCase();
        return props.companies.filter((c) => c.id.toLowerCase().includes(needle) ||
            c.label.toLowerCase().includes(needle) ||
            (c.blurb?.toLowerCase().includes(needle) ?? false));
    }, [props.companies, filter]);
    const initial = Math.max(0, filtered.findIndex((c) => c.isCurrent));
    const [cursor, setCursor] = React.useState(initial);
    React.useEffect(() => {
        setCursor((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
    }, [filtered.length]);
    useInput((ch, key) => {
        if (key.escape) {
            if (filter) {
                setFilter("");
                return;
            }
            props.onCancel();
            return;
        }
        if (key.upArrow || (key.ctrl && ch === "p")) {
            setCursor((c) => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow || (key.ctrl && ch === "n")) {
            setCursor((c) => Math.min(Math.max(0, filtered.length - 1), c + 1));
            return;
        }
        // key.return covers \r (CR); input === '\n' covers terminals that
        // send LF for Enter (parseKeypress names it 'enter', not 'return').
        if (key.return || ch === "\n") {
            const picked = filtered[cursor];
            if (picked)
                props.onPick(picked.id);
            return;
        }
        if (key.backspace || key.delete) {
            setFilter((f) => f.slice(0, -1));
            return;
        }
        if (ch && /^[1-9]$/.test(ch) && !filter) {
            const n = Number(ch) - 1;
            if (n < filtered.length) {
                const picked = filtered[n];
                if (picked)
                    props.onPick(picked.id);
            }
            return;
        }
        if (ch && !key.ctrl && !key.meta && /^[\w@\-./:]$/.test(ch)) {
            setFilter((f) => f + ch);
        }
    }, { isActive: true });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.text.accent, paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { color: palette.text.accent, bold: true, children: "OpenRouter \u00B7 pick a company" }), filter ? (_jsxs(Text, { color: palette.text.accent, children: [_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["filter:", " "] }), filter, _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [" ", "(", filtered.length, ")"] })] })) : (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [filtered.length, " companies \u00B7 then pick a model"] }))] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [filtered.length === 0 && (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["No companies match \"", filter, "\"."] })), filtered.map((c, idx) => {
                        const isCursor = idx === cursor;
                        const lead = isCursor ? "▸" : c.isCurrent ? "●" : " ";
                        const num = idx < 9 && !filter ? String(idx + 1) : " ";
                        const labelColour = isCursor
                            ? palette.text.primary
                            : c.isCurrent
                                ? palette.text.accent
                                : palette.text.secondary;
                        return (_jsxs(Box, { flexDirection: "row", paddingLeft: 1, children: [_jsx(Box, { minWidth: 2, flexShrink: 0, children: _jsx(Text, { color: isCursor
                                            ? palette.text.accent
                                            : c.isCurrent
                                                ? palette.text.accent
                                                : palette.text.secondary, children: lead }) }), _jsx(Box, { minWidth: 2, flexShrink: 0, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: num }) }), _jsx(Box, { flexShrink: 1, children: _jsx(Text, { color: labelColour, bold: isCursor, wrap: "wrap", children: c.label }) }), _jsx(Box, { flexGrow: 1, flexShrink: 1, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, wrap: "wrap", children: c.blurb ?? "" }) }), _jsx(Box, { minWidth: 10, flexShrink: 0, justifyContent: "flex-end", children: _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [c.modelCount, " model", c.modelCount === 1 ? "" : "s"] }) })] }, c.id));
                    })] }), _jsx(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: palette.border.default, flexDirection: "column", children: _jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [_jsx(Text, { bold: true, color: palette.text.primary, children: "\u2191\u2193" }), " ", "nav", "   ", _jsx(Text, { bold: true, color: palette.text.primary, children: "enter" }), " ", "models", "   ", _jsx(Text, { bold: true, color: palette.text.primary, children: "1-9" }), " ", "jump"] }), _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [_jsx(Text, { bold: true, color: palette.text.primary, children: "type" }), " ", "filter", "   ", _jsx(Text, { bold: true, color: palette.text.primary, children: "esc" }), " ", filter ? "clear" : "back"] })] }) })] }));
}
//# sourceMappingURL=OpenRouterCompanyPicker.js.map