import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { parse } from './parser.js';
import { RenderInline } from './inline.js';
import { CodeColorizer } from './colorizer.js';
import { TableRenderer } from './table.js';
export function MarkdownDisplay(props) {
    const { text, palette, width = 80 } = props;
    if (!text)
        return null;
    const blocks = parse(text);
    return (_jsx(Box, { flexDirection: "column", children: blocks.map((b, i) => (_jsx(BlockView, { block: b, palette: palette, width: width, idx: i }, i))) }));
}
function BlockView({ block, palette, width, idx }) {
    switch (block.kind) {
        case 'blank':
            return _jsx(Box, { height: 1 });
        case 'heading': {
            const colour = block.level === 1 ? palette.text.accent
                : block.level === 2 ? palette.text.accent
                    : palette.text.primary;
            const prefix = '#'.repeat(block.level);
            return (_jsx(Box, { marginTop: idx === 0 ? 0 : 1, marginBottom: 0, flexDirection: "column", children: _jsxs(Text, { children: [_jsxs(Text, { color: palette.ui.symbol, dimColor: true, children: [prefix, " "] }), _jsx(Text, { bold: true, color: colour, children: _jsx(RenderInline, { text: block.text, palette: palette, baseColor: colour, keyPrefix: `h${idx}` }) })] }) }));
        }
        case 'paragraph':
            return (_jsx(Box, { children: _jsx(RenderInline, { text: block.text, palette: palette, keyPrefix: `p${idx}` }) }));
        case 'code': {
            const lang = block.lang;
            const codeText = block.lines.join('\n');
            return (_jsxs(Box, { marginY: 0, paddingX: 1, borderStyle: "round", borderColor: palette.border.default, borderDimColor: true, flexDirection: "column", children: [lang && (_jsx(Box, { children: _jsx(Text, { color: palette.text.secondary, dimColor: true, children: lang }) })), _jsx(CodeColorizer, { code: codeText, lang: lang, palette: palette })] }));
        }
        case 'list':
            return (_jsx(Box, { flexDirection: "column", children: block.items.map((item, i) => (_jsx(ListItemRow, { item: item, palette: palette, ordered: block.ordered, numberWidth: String(block.items.length).length, keyPrefix: `l${idx}-${i}` }, i))) }));
        case 'rule':
            return (_jsx(Box, { marginY: 1, children: _jsx(Text, { color: palette.border.default, children: '─'.repeat(Math.max(20, Math.min(60, width - 4))) }) }));
        case 'table':
            return (_jsx(TableRenderer, { headers: block.headers, rows: block.rows, align: block.align, palette: palette, maxWidth: width }));
        case 'blockquote':
            return (_jsxs(Box, { flexDirection: "row", marginY: 0, children: [_jsx(Box, { marginRight: 1, children: _jsx(Text, { color: palette.text.accent, children: "\u2502" }) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { italic: true, color: palette.text.secondary, children: _jsx(RenderInline, { text: block.text, palette: palette, baseColor: palette.text.secondary, keyPrefix: `q${idx}` }) }) })] }));
    }
}
function ListItemRow({ item, palette, ordered, numberWidth, keyPrefix }) {
    const indent = Math.floor(item.depth / 2);
    const bullets = ['•', '◦', '▪', '▫'];
    const bullet = ordered
        ? `${item.marker.padStart(numberWidth, ' ')}.`
        : bullets[indent % bullets.length];
    return (_jsxs(Box, { flexDirection: "row", paddingLeft: indent * 2, children: [_jsx(Box, { marginRight: 1, children: _jsx(Text, { color: palette.text.accent, children: bullet }) }), _jsx(Box, { flexGrow: 1, children: _jsx(RenderInline, { text: item.text, palette: palette, keyPrefix: keyPrefix }) })] }));
}
//# sourceMappingURL=display.js.map