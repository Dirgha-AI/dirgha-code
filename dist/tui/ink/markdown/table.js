import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Pipe-syntax markdown table renderer.
 *
 * Computes column widths from header + rows, pads cells with the
 * specified alignment, and draws light unicode separators. Cells
 * pass through `RenderInline` so bold/italic/code/links inside cells
 * render correctly.
 */
import * as React from 'react';
import { Box, Text } from 'ink';
import { RenderInline } from './inline.js';
export function TableRenderer(props) {
    const { headers, rows, align, palette, maxWidth } = props;
    // Compute display widths from raw text (RenderInline strips markers visually,
    // but for layout sizing we strip them here so the columns align).
    const stripped = (s) => s.replace(/\*\*|\*|~~|_|`+|<\/?u>/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1');
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    const widths = new Array(colCount).fill(0);
    const cellWidth = (cells, i) => cells[i] ? stripped(cells[i]).length : 0;
    for (let i = 0; i < colCount; i += 1) {
        widths[i] = Math.max(cellWidth(headers, i), ...rows.map(r => cellWidth(r, i)));
    }
    // Scale down if the total exceeds the available width.
    const sep = ' │ ';
    const used = widths.reduce((a, b) => a + b, 0) + sep.length * (colCount - 1) + 4; // 2 padding + 2 borders
    if (used > maxWidth) {
        const ratio = (maxWidth - sep.length * (colCount - 1) - 4) / widths.reduce((a, b) => a + b, 0);
        for (let i = 0; i < widths.length; i += 1) {
            widths[i] = Math.max(3, Math.floor(widths[i] * ratio));
        }
    }
    return (_jsxs(Box, { flexDirection: "column", marginY: 1, children: [_jsx(Box, { children: headers.map((h, i) => (_jsxs(React.Fragment, { children: [i > 0 && _jsx(Text, { color: palette.border.default, children: sep }), _jsx(PadCell, { raw: h, width: widths[i], align: align[i] ?? 'left', palette: palette, bold: true, keyPrefix: `h-${i}` })] }, `h-${i}`))) }), _jsx(Box, { children: _jsx(Text, { color: palette.border.default, children: widths
                        .map((w, i) => '─'.repeat(w) + (i < widths.length - 1 ? '─┼─' : ''))
                        .join('') }) }), rows.map((row, ri) => (_jsx(Box, { children: row.slice(0, colCount).map((cell, ci) => (_jsxs(React.Fragment, { children: [ci > 0 && _jsx(Text, { color: palette.border.default, children: sep }), _jsx(PadCell, { raw: cell, width: widths[ci], align: align[ci] ?? 'left', palette: palette, keyPrefix: `r-${ri}-c-${ci}` })] }, `r-${ri}-c-${ci}`))) }, `r-${ri}`)))] }));
}
function PadCell(props) {
    const { raw, width, align, palette, bold, keyPrefix } = props;
    const visible = raw.replace(/\*\*|\*|~~|_|`+|<\/?u>/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1');
    const truncated = visible.length > width ? visible.slice(0, Math.max(0, width - 1)) + '…' : visible;
    const padTotal = Math.max(0, width - truncated.length);
    const padLeft = align === 'right' ? padTotal : align === 'center' ? Math.floor(padTotal / 2) : 0;
    const padRight = padTotal - padLeft;
    const content = ' '.repeat(padLeft) + truncated + ' '.repeat(padRight);
    // For visual fidelity, render the inline-styled raw text WITHOUT the inline
    // padding (ink will lay it out in the box width). The trade-off: bold/italic
    // markers are visible if a raw cell contains them, but the column widths
    // stay aligned. For most agent-output tables this is fine.
    if (bold) {
        return (_jsx(Text, { bold: true, color: palette.text.primary, children: content }));
    }
    return (_jsxs(Box, { width: width, children: [_jsx(RenderInline, { text: truncated, palette: palette, keyPrefix: keyPrefix }), _jsx(Text, { children: ' '.repeat(padTotal) })] }));
}
//# sourceMappingURL=table.js.map