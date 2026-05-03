import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Modal overlay for picking a model — opencode-style polish.
 *
 * Presentation: a bordered, centred box with the model catalogue
 * grouped by provider. Arrow keys move the cursor; Enter selects;
 * Esc / `q` cancels. Digit keys 1-9 pick by position within the
 * filtered list. Letters typed when not in command mode build a
 * fuzzy filter; Backspace removes the last char.
 *
 * Visual cues mirror opencode's DialogModel:
 *   ● leading filled disc for the currently-selected model
 *   ▸ leading caret for the cursor row (overrides ●)
 *   right-aligned tier footer (free / basic / pro / premium / price)
 *   bottom keybind hint bar with all shortcuts
 *
 * Shape stays small (≤220 LOC); the catalogue itself is owned
 * upstream so this file is purely presentational.
 */
import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTheme } from "../theme-context.js";
function groupByProvider(models) {
    const map = new Map();
    for (const m of models) {
        const list = map.get(m.provider) ?? [];
        list.push(m);
        map.set(m.provider, list);
    }
    return [...map.entries()].map(([provider, items]) => ({ provider, items }));
}
export function ModelPicker(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 4, 80);
    // Tier colors derived from the active theme palette instead of
    // hardcoded Ink color names so they respect the user's theme choice.
    const tierColor = {
        free: palette.status.success,
        basic: palette.brand,
        pro: palette.accent,
        premium: palette.status.warning,
    };
    const [filter, setFilter] = React.useState("");
    const filtered = React.useMemo(() => {
        if (filter.length === 0)
            return props.models;
        const needle = filter.toLowerCase();
        return props.models.filter((m) => m.id.toLowerCase().includes(needle) ||
            m.provider.toLowerCase().includes(needle) ||
            (m.label?.toLowerCase().includes(needle) ?? false));
    }, [props.models, filter]);
    const initial = Math.max(0, filtered.findIndex((m) => m.id === props.current));
    const [cursor, setCursor] = React.useState(initial);
    // Reset cursor when filter changes so it lands on the first match.
    React.useEffect(() => {
        setCursor((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
    }, [filtered.length]);
    useInput((ch, key) => {
        if (key.escape) {
            if (filter.length > 0) {
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
        if (key.return) {
            const picked = filtered[cursor];
            if (picked)
                props.onPick(picked.id);
            return;
        }
        if (key.backspace || key.delete) {
            setFilter((f) => f.slice(0, -1));
            return;
        }
        if (ch && /^[1-9]$/.test(ch) && filter.length === 0) {
            const n = Number(ch) - 1;
            if (n < filtered.length) {
                const picked = filtered[n];
                if (picked)
                    props.onPick(picked.id);
            }
            return;
        }
        // Any printable char that wasn't a control key extends the filter.
        if (ch && !key.ctrl && !key.meta && /^[\w@\-./:]$/.test(ch)) {
            setFilter((f) => f + ch);
        }
    }, { isActive: true });
    const groups = groupByProvider(filtered);
    const selected = filtered[cursor];
    const titleWidth = width - 24;
    // Build a flat row index so digit shortcuts map to the visible ordering.
    let idx = 0;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.accent, paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { color: palette.accent, bold: true, children: "Select model" }), filter.length > 0 ? (_jsxs(Text, { color: palette.text.accent, children: [_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["filter:", " "] }), filter, _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [" ", "(", filtered.length, ")"] })] })) : (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [filtered.length, " models"] }))] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [filtered.length === 0 && (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["No models match \"", filter, "\"."] })), groups.map((group) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { color: palette.text.secondary, dimColor: true, children: group.provider }), group.items.map((m) => {
                                const myIdx = idx;
                                idx += 1;
                                const isCursor = myIdx === cursor;
                                const isCurrent = m.id === props.current;
                                const num = myIdx < 9 && filter.length === 0 ? String(myIdx + 1) : " ";
                                const tierLabel = m.tier
                                    ? tierColor[m.tier]
                                    : palette.text.secondary;
                                const lead = isCursor ? "▸" : isCurrent ? "●" : " ";
                                const titleColor = isCursor
                                    ? palette.text.primary
                                    : isCurrent
                                        ? palette.text.accent
                                        : palette.text.secondary;
                                const title = m.label ?? m.id;
                                const truncatedTitle = title.length > titleWidth
                                    ? `${title.slice(0, titleWidth - 1)}…`
                                    : title;
                                return (_jsxs(Box, { flexDirection: "row", paddingLeft: 1, children: [_jsx(Box, { minWidth: 2, children: _jsx(Text, { color: isCursor
                                                    ? palette.text.accent
                                                    : isCurrent
                                                        ? palette.text.accent
                                                        : palette.text.secondary, children: lead }) }), _jsx(Box, { minWidth: 2, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: num }) }), _jsx(Box, { flexGrow: 1, children: _jsx(Text, { color: titleColor, bold: isCursor, children: truncatedTitle }) }), m.tier !== undefined && (_jsx(Box, { minWidth: 8, justifyContent: "flex-end", children: _jsx(Text, { color: tierLabel, dimColor: !isCursor, children: m.tier }) }))] }, m.id));
                            })] }, group.provider)))] }), _jsxs(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: palette.border.default, flexDirection: "column", children: [_jsxs(Box, { children: [_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["\u2192", " "] }), _jsx(Text, { color: palette.text.accent, children: selected?.id ?? props.current })] }), _jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [_jsx(Text, { bold: true, color: palette.text.primary, children: "\u2191\u2193" }), " ", "nav", "   ", _jsx(Text, { bold: true, color: palette.text.primary, children: "enter" }), " ", "pick", "   ", _jsx(Text, { bold: true, color: palette.text.primary, children: "1-9" }), " ", "jump"] }), _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [_jsx(Text, { bold: true, color: palette.text.primary, children: "type" }), " ", "filter", "   ", _jsx(Text, { bold: true, color: palette.text.primary, children: "esc" }), " ", filter ? "clear" : "cancel"] })] })] })] }));
}
//# sourceMappingURL=ModelPicker.js.map