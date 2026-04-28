import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Text } from 'ink';
const BOLD_LEN = 2;
const ITALIC_LEN = 1;
const STRIKE_LEN = 2;
const CODE_LEN = 1;
const U_OPEN_LEN = 3; // <u>
const U_CLOSE_LEN = 4; // </u>
// Same alternation as gemini's parser. Order matters: ***foo*** must match
// before **foo** before *foo* / _foo_ / ~~foo~~ / [text](url) / `code` /
// <u>...</u> / bare URLs.
const INLINE_REGEX = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
/** Render one or more lines of markdown text with inline emphasis. */
export function RenderInline(props) {
    const { text, palette, baseColor, keyPrefix = 'i' } = props;
    const fg = baseColor ?? palette.text.primary;
    // Fast path — no markdown markers anywhere.
    if (!/[*_~`<[]|https?:/.test(text)) {
        return _jsx(Text, { color: fg, children: text });
    }
    const out = [];
    let lastIdx = 0;
    let match;
    let segIdx = 0;
    // Reset regex state on each call (regex is module-level for perf, but
    // RegExp.prototype.lastIndex persists across invocations).
    INLINE_REGEX.lastIndex = 0;
    while ((match = INLINE_REGEX.exec(text)) !== null) {
        if (match.index > lastIdx) {
            const plain = text.slice(lastIdx, match.index);
            out.push(_jsx(Text, { color: fg, children: plain }, `${keyPrefix}-${segIdx++}`));
        }
        const full = match[0];
        const node = renderSegment(full, palette, fg, `${keyPrefix}-${segIdx}`, text, match.index, INLINE_REGEX.lastIndex);
        out.push(node);
        segIdx += 1;
        lastIdx = INLINE_REGEX.lastIndex;
    }
    if (lastIdx < text.length) {
        out.push(_jsx(Text, { color: fg, children: text.slice(lastIdx) }, `${keyPrefix}-${segIdx}`));
    }
    return _jsx(Text, { children: out });
}
function renderSegment(full, palette, fg, key, 
/** Source text, used for italic boundary heuristics. */
src, matchStart, matchEnd) {
    // ***bold-italic***
    if (full.startsWith('***') &&
        full.endsWith('***') &&
        full.length > (BOLD_LEN + ITALIC_LEN) * 2) {
        const inner = full.slice(BOLD_LEN + ITALIC_LEN, -BOLD_LEN - ITALIC_LEN);
        return (_jsx(Text, { bold: true, italic: true, children: _jsx(RenderInline, { text: inner, palette: palette, baseColor: fg, keyPrefix: `${key}b` }) }, key));
    }
    // **bold**
    if (full.startsWith('**') && full.endsWith('**') && full.length > BOLD_LEN * 2) {
        const inner = full.slice(BOLD_LEN, -BOLD_LEN);
        return (_jsx(Text, { bold: true, children: _jsx(RenderInline, { text: inner, palette: palette, baseColor: fg, keyPrefix: `${key}b` }) }, key));
    }
    // *italic* / _italic_  — boundary heuristic from gemini: don't match if
    // adjacent to word chars, and don't match path-like patterns.
    if (full.length > ITALIC_LEN * 2 &&
        ((full.startsWith('*') && full.endsWith('*')) ||
            (full.startsWith('_') && full.endsWith('_'))) &&
        !/\w/.test(src.substring(matchStart - 1, matchStart)) &&
        !/\w/.test(src.substring(matchEnd, matchEnd + 1)) &&
        !/\S[./\\]/.test(src.substring(matchStart - 2, matchStart)) &&
        !/[./\\]\S/.test(src.substring(matchEnd, matchEnd + 2))) {
        const inner = full.slice(ITALIC_LEN, -ITALIC_LEN);
        return (_jsx(Text, { italic: true, children: _jsx(RenderInline, { text: inner, palette: palette, baseColor: fg, keyPrefix: `${key}i` }) }, key));
    }
    // ~~strikethrough~~
    if (full.startsWith('~~') && full.endsWith('~~') && full.length > STRIKE_LEN * 2) {
        const inner = full.slice(STRIKE_LEN, -STRIKE_LEN);
        return (_jsx(Text, { strikethrough: true, children: _jsx(RenderInline, { text: inner, palette: palette, baseColor: fg, keyPrefix: `${key}s` }) }, key));
    }
    // `inline code` — supports n-tick fences (`` x ``) by matching a balanced run.
    if (full.startsWith('`') && full.endsWith('`') && full.length > CODE_LEN) {
        const m = full.match(/^(`+)(.+?)\1$/s);
        if (m && m[2]) {
            return (_jsx(Text, { color: palette.text.accent, children: m[2] }, key));
        }
    }
    // [text](url)
    if (full.startsWith('[') && full.includes('](') && full.endsWith(')')) {
        const m = full.match(/\[(.*?)\]\((.*?)\)/);
        if (m) {
            const [, linkText, url] = m;
            return (_jsxs(Text, { children: [_jsx(RenderInline, { text: linkText, palette: palette, baseColor: fg, keyPrefix: `${key}l` }), _jsx(Text, { color: fg, children: " (" }), _jsx(Text, { color: palette.text.link, underline: true, children: url }), _jsx(Text, { color: fg, children: ")" })] }, key));
        }
    }
    // <u>underline</u>
    if (full.startsWith('<u>') &&
        full.endsWith('</u>') &&
        full.length > U_OPEN_LEN + U_CLOSE_LEN - 1) {
        const inner = full.slice(U_OPEN_LEN, -U_CLOSE_LEN);
        return (_jsx(Text, { underline: true, children: _jsx(RenderInline, { text: inner, palette: palette, baseColor: fg, keyPrefix: `${key}u` }) }, key));
    }
    // bare URL
    if (/^https?:\/\//.test(full)) {
        return (_jsx(Text, { color: palette.text.link, underline: true, children: full }, key));
    }
    // Fallback — render raw.
    return (_jsx(Text, { color: fg, children: full }, key));
}
//# sourceMappingURL=inline.js.map