import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Two-step model picker — provider card grid → model list.
 *
 * Stage 1 of the new flow (paired with ModelPicker for stage 2).
 * Shows one row per registered provider with:
 *   ●  if any model from this provider is the currently-selected one
 *   ⓘ  with a model-count badge
 *   short blurb (kimi/deepseek/qwen/...)
 *   key-status indicator (✓ key set, ⚠ key missing)
 *
 * Mirrors opencode's DialogProvider → DialogModel chain, so users
 * with 50+ models in catalogue don't drown in one giant list.
 *
 * Keys:
 *   ↑↓ / k j / ctrl+p ctrl+n  navigate
 *   1-9   jump
 *   enter pick → opens ModelPicker filtered to this provider
 *   esc   cancel
 *   /     start typing to fuzzy-filter the provider names
 */
import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';
export function ProviderPicker(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 4, 80);
    const [filter, setFilter] = React.useState('');
    const filtered = React.useMemo(() => {
        if (!filter)
            return props.providers;
        const needle = filter.toLowerCase();
        return props.providers.filter(p => p.id.toLowerCase().includes(needle) ||
            p.label.toLowerCase().includes(needle) ||
            (p.blurb?.toLowerCase().includes(needle) ?? false));
    }, [props.providers, filter]);
    const initial = Math.max(0, filtered.findIndex(p => p.isCurrent));
    const [cursor, setCursor] = React.useState(initial);
    React.useEffect(() => {
        setCursor(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
    }, [filtered.length]);
    useInput((ch, key) => {
        if (key.escape) {
            if (filter) {
                setFilter('');
                return;
            }
            props.onCancel();
            return;
        }
        if (key.upArrow || (key.ctrl && ch === 'p')) {
            setCursor(c => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow || (key.ctrl && ch === 'n')) {
            setCursor(c => Math.min(Math.max(0, filtered.length - 1), c + 1));
            return;
        }
        if (key.return) {
            const picked = filtered[cursor];
            if (picked)
                props.onPick(picked.id);
            return;
        }
        if (key.backspace || key.delete) {
            setFilter(f => f.slice(0, -1));
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
            setFilter(f => f + ch);
        }
    }, { isActive: true });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.text.accent, paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { color: palette.text.accent, bold: true, children: "Pick a provider" }), filter ? (_jsxs(Text, { color: palette.text.accent, children: [_jsx(Text, { color: palette.text.secondary, dimColor: true, children: "filter: " }), filter, _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [" (", filtered.length, ")"] })] })) : (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [filtered.length, " providers \u00B7 then pick a model"] }))] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [filtered.length === 0 && (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["No providers match \"", filter, "\"."] })), filtered.map((p, idx) => {
                        const isCursor = idx === cursor;
                        const lead = isCursor ? '▸' : p.isCurrent ? '●' : ' ';
                        const num = idx < 9 && !filter ? String(idx + 1) : ' ';
                        const labelColour = isCursor
                            ? palette.text.primary
                            : p.isCurrent
                                ? palette.text.accent
                                : palette.text.secondary;
                        const keyBadge = p.hasKey ? '✓' : '⚠';
                        const keyBadgeColour = p.hasKey ? palette.status.success : palette.status.warning;
                        return (_jsxs(Box, { flexDirection: "row", paddingLeft: 1, children: [_jsx(Box, { minWidth: 2, children: _jsx(Text, { color: isCursor ? palette.text.accent : p.isCurrent ? palette.text.accent : palette.text.secondary, children: lead }) }), _jsx(Box, { minWidth: 2, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: num }) }), _jsx(Box, { minWidth: 2, children: _jsx(Text, { color: keyBadgeColour, children: keyBadge }) }), _jsx(Box, { minWidth: 14, children: _jsx(Text, { color: labelColour, bold: isCursor, children: p.label }) }), _jsx(Box, { flexGrow: 1, children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: p.blurb ?? '' }) }), _jsx(Box, { minWidth: 10, justifyContent: "flex-end", children: _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [p.modelCount, " model", p.modelCount === 1 ? '' : 's'] }) })] }, p.id));
                    })] }), _jsx(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: palette.border.default, flexDirection: "column", children: _jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [_jsx(Text, { bold: true, color: palette.text.primary, children: "\u2191\u2193" }), " nav", '   ', _jsx(Text, { bold: true, color: palette.text.primary, children: "enter" }), " models", '   ', _jsx(Text, { bold: true, color: palette.text.primary, children: "1-9" }), " jump"] }), _jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [_jsx(Text, { bold: true, color: palette.text.primary, children: "type" }), " filter", '   ', _jsx(Text, { bold: true, color: palette.text.primary, children: "esc" }), " ", filter ? 'clear' : 'cancel'] })] }) })] }));
}
//# sourceMappingURL=ProviderPicker.js.map