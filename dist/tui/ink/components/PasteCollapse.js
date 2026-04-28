import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
export const PASTE_LINE_THRESHOLD = 4;
export const PASTE_CHAR_THRESHOLD = 200;
/**
 * Returns a segment describing a just-pasted block when the delta between
 * two consecutive buffer values looks like a paste. Returns null when the
 * change looks like ordinary typing.
 */
export function detectPaste(prev, next) {
    if (next.length - prev.length < PASTE_CHAR_THRESHOLD &&
        countLines(next) - countLines(prev) < PASTE_LINE_THRESHOLD) {
        return null;
    }
    // Locate the insertion point by finding the longest common prefix + suffix.
    let prefix = 0;
    while (prefix < prev.length && prefix < next.length && prev[prefix] === next[prefix])
        prefix += 1;
    let suffix = 0;
    while (suffix < (prev.length - prefix) &&
        suffix < (next.length - prefix) &&
        prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix])
        suffix += 1;
    const start = prefix;
    const end = next.length - suffix;
    if (end <= start)
        return null;
    const inserted = next.slice(start, end);
    return {
        start,
        end,
        lines: countLines(inserted),
        chars: inserted.length,
    };
}
function countLines(s) {
    if (s === '')
        return 0;
    let n = 1;
    for (let i = 0; i < s.length; i += 1)
        if (s[i] === '\n')
            n += 1;
    return n;
}
/**
 * Renders the buffer with the pasted region collapsed behind a
 * placeholder when `expanded` is false. Always renders a small
 * hint so the user knows Ctrl+E toggles it.
 */
export function PasteCollapseView(props) {
    const { value, segment, expanded } = props;
    if (expanded) {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: value }), _jsxs(Text, { color: "gray", dimColor: true, children: ["[", segment.lines, " line", segment.lines === 1 ? '' : 's', ", ", segment.chars, " chars expanded \u00B7 Ctrl+E to collapse]"] })] }));
    }
    const before = value.slice(0, segment.start);
    const after = value.slice(segment.end);
    return (_jsxs(Box, { flexDirection: "row", flexWrap: "wrap", children: [_jsx(Text, { children: before }), _jsxs(Text, { color: "yellow", children: ["[", segment.lines, " line", segment.lines === 1 ? '' : 's', " pasted, ", segment.chars, " chars]"] }), _jsx(Text, { children: after }), _jsx(Text, { color: "gray", dimColor: true, children: " \u00B7 Ctrl+E expand" })] }));
}
//# sourceMappingURL=PasteCollapse.js.map