import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { tokenize } from './langs/index.js';
export function CodeColorizer(props) {
    const { code, lang, palette, showLineNumbers = false, maxLines } = props;
    const tokens = tokenize(code, lang);
    const lines = tokensToLines(tokens);
    const visible = maxLines !== undefined && lines.length > maxLines
        ? lines.slice(lines.length - maxLines)
        : lines;
    const startLine = lines.length - visible.length + 1;
    const gutterWidth = String(lines.length).length;
    return (_jsx(Box, { flexDirection: "column", children: visible.map((lineToks, idx) => (_jsxs(Box, { flexDirection: "row", children: [showLineNumbers && (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: [String(startLine + idx).padStart(gutterWidth, ' '), '  '] })), _jsx(Text, { children: lineToks.length === 0 ? (_jsx(Text, { children: ' ' })) : (lineToks.map((tok, i) => (_jsx(Text, { color: colorFor(tok.kind, palette), children: tok.value }, i)))) })] }, idx))) }));
}
/** Split a flat token stream into per-line arrays so each line can render independently. */
function tokensToLines(tokens) {
    const lines = [[]];
    for (const tok of tokens) {
        if (!tok.value)
            continue;
        const parts = tok.value.split('\n');
        for (let p = 0; p < parts.length; p += 1) {
            const piece = parts[p];
            if (piece.length > 0) {
                lines[lines.length - 1].push({ kind: tok.kind, value: piece });
            }
            if (p < parts.length - 1) {
                lines.push([]);
            }
        }
    }
    // If the source ended with a newline we'll have a trailing empty line; drop it.
    if (lines.length > 1 && lines[lines.length - 1].length === 0)
        lines.pop();
    return lines;
}
function colorFor(kind, palette) {
    switch (kind) {
        case 'keyword': return palette.text.accent; // purple-ish per theme
        case 'string': return palette.status.success; // green-ish
        case 'number': return palette.text.link; // blue-ish
        case 'comment': return palette.ui.comment; // muted
        case 'type': return palette.status.warning; // yellow-ish
        case 'builtin': return palette.text.accent;
        case 'operator': return palette.text.secondary;
        case 'attr': return palette.status.warning;
        case 'tag': return palette.text.link;
        case 'meta': return palette.text.accent;
        case 'addition': return palette.status.success;
        case 'deletion': return palette.status.error;
        case 'punct': return palette.text.primary;
        case 'plain':
        default: return palette.text.primary;
    }
}
//# sourceMappingURL=colorizer.js.map