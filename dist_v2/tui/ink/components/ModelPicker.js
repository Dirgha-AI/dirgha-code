import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Modal overlay for picking a model.
 *
 * Presentation: a bordered, centred box with the model catalogue
 * grouped by provider. Arrow keys move the cursor, Enter selects,
 * Esc / `q` cancels. Digit keys 1-9 pick by position within the
 * visible list for muscle-memory speed.
 *
 * Shape of the overlay is deliberately small (≤200 LOC); the
 * catalogue itself is owned upstream so this file stays purely
 * presentational.
 */
import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
const TIER_COLOR = {
    free: 'greenBright',
    basic: 'cyan',
    pro: 'magenta',
    premium: 'yellow',
};
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
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 4, 72);
    const initial = Math.max(0, props.models.findIndex(m => m.id === props.current));
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
            setCursor(c => Math.min(props.models.length - 1, c + 1));
            return;
        }
        if (key.return) {
            const picked = props.models[cursor];
            if (picked)
                props.onPick(picked.id);
            return;
        }
        if (ch && /^[1-9]$/.test(ch)) {
            const n = Number(ch) - 1;
            if (n < props.models.length) {
                const picked = props.models[n];
                if (picked)
                    props.onPick(picked.id);
            }
        }
    });
    const groups = groupByProvider(props.models);
    const selected = props.models[cursor];
    // Build a flat row index so digit shortcuts map to the visible ordering.
    let idx = 0;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "magenta", paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { color: "magenta", bold: true, children: "model picker" }), _jsx(Text, { color: "gray", dimColor: true, children: "\u2191\u2193 enter \u00B7 1-9 \u00B7 esc" })] }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: groups.map(group => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { color: "cyan", dimColor: true, children: group.provider }), group.items.map(m => {
                            const myIdx = idx;
                            idx += 1;
                            const isCursor = myIdx === cursor;
                            const isCurrent = m.id === props.current;
                            const prefix = isCursor ? '>' : isCurrent ? '•' : ' ';
                            const num = myIdx < 9 ? String(myIdx + 1) : ' ';
                            const tierColor = m.tier ? TIER_COLOR[m.tier] : 'gray';
                            return (_jsxs(Box, { gap: 1, paddingLeft: 1, children: [_jsx(Text, { color: isCursor ? 'magentaBright' : 'gray', children: prefix }), _jsx(Text, { color: "gray", dimColor: true, children: num }), _jsx(Text, { color: isCursor ? 'white' : isCurrent ? 'magenta' : 'gray', bold: isCursor, children: m.label ?? m.id }), m.tier !== undefined && (_jsx(Text, { color: tierColor, dimColor: !isCursor, children: m.tier }))] }, m.id));
                        })] }, group.provider))) }), _jsx(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: "gray", children: _jsxs(Box, { gap: 1, children: [_jsx(Text, { color: "gray", dimColor: true, children: "\u2192" }), _jsx(Text, { color: "magenta", children: selected?.id ?? props.current })] }) })] }));
}
//# sourceMappingURL=ModelPicker.js.map