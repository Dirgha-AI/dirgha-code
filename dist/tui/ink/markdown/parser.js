/**
 * Block-level markdown parser.
 *
 * Walks the input line-by-line through a tiny state machine and emits
 * a flat array of typed blocks. Block types match what the renderer
 * understands (headings, paragraphs, code fences, ordered/unordered
 * list items, horizontal rules, tables, blockquotes). No streaming
 * AST — markdown blocks are independent at this level so a flat
 * array is enough.
 *
 * Incremental mode (`createIncrementalParser`) keeps a prefix cache so
 * streaming delta-only re-parses aren't O(n²). When text grows, only the
 * new tail is re-evaluated; the cached prefix blocks are reused.
 *
 * Adapted from gemini-cli's MarkdownDisplay.tsx parsing loop
 * (Apache-2.0). Logic preserved; types & module structure are
 * dirgha-native so the renderer can iterate plain data.
 */
/**
 * Incremental parser — reuse cached blocks when text grows.
 * During streaming, markdown text only appends; re-parsing the
 * entire accumulated string is O(n²). This class holds the last
 * full parse result and only re-evaluates the delta tail.
 */
export class IncrementalParser {
    lastText = "";
    cachedBlocks = [];
    parse(text) {
        if (!text)
            return [];
        // Full text shorter than cached → reset (e.g. cleared / new message).
        if (text.length < this.lastText.length) {
            const blocks = parse(text);
            this.lastText = text;
            this.cachedBlocks = blocks;
            return blocks;
        }
        // Same text → return cached.
        if (text === this.lastText)
            return this.cachedBlocks;
        // Text grew — only re-parse the tail.
        const delta = text.slice(this.lastText.length);
        const deltaLines = delta.split(/\r?\n/);
        // If the cached blocks end with a "soft" block (paragraph, blockquote)
        // that can absorb the delta, merge it.
        const lastBlock = this.cachedBlocks[this.cachedBlocks.length - 1];
        if (lastBlock &&
            (lastBlock.kind === "paragraph" || lastBlock.kind === "blockquote") &&
            !delta.startsWith("\n")) {
            // Remove last block, re-parse it + delta together, splice back.
            const prefixBeforeLast = this.cachedBlocks.slice(0, -1);
            let lastText2 = "";
            if (lastBlock.kind === "paragraph")
                lastText2 = lastBlock.text;
            if (lastBlock.kind === "blockquote")
                lastText2 = lastBlock.text;
            const mergedText = lastText2 + delta;
            const rewritten = parse(mergedText);
            this.cachedBlocks = [...prefixBeforeLast, ...rewritten];
        }
        else if (deltaLines.length > 0 && delta !== "\n") {
            // Parse only delta lines and append new blocks.
            const deltaBlocks = parse(delta);
            if (deltaBlocks.length > 0) {
                this.cachedBlocks = [...this.cachedBlocks, ...deltaBlocks];
            }
        }
        this.lastText = text;
        return this.cachedBlocks;
    }
}
const HEADING = /^ *(#{1,4}) +(.*)/;
const FENCE = /^ *(`{3,}|~{3,}) *(\w*?) *$/;
const UL_ITEM = /^([ \t]*)([-*+]) +(.*)/;
const OL_ITEM = /^([ \t]*)(\d+)\. +(.*)/;
const HR = /^ *([-*_] *){3,} *$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/;
const BLOCKQUOTE = /^ *> ?(.*)/;
export function parse(text) {
    if (!text)
        return [];
    const lines = text.split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // Blank line.
        if (line.trim() === "") {
            // Coalesce runs of blanks into a single block.
            if (out.length > 0 && out[out.length - 1].kind !== "blank") {
                out.push({ kind: "blank" });
            }
            i += 1;
            continue;
        }
        // Code fence.
        const fenceM = line.match(FENCE);
        if (fenceM) {
            const fence = fenceM[1];
            const lang = fenceM[2] || null;
            const codeLines = [];
            i += 1;
            while (i < lines.length) {
                const closeM = lines[i].match(FENCE);
                if (closeM &&
                    closeM[1].startsWith(fence[0]) &&
                    closeM[1].length >= fence.length) {
                    i += 1;
                    break;
                }
                codeLines.push(lines[i]);
                i += 1;
            }
            out.push({ kind: "code", lang, lines: codeLines });
            continue;
        }
        // Heading.
        const headingM = line.match(HEADING);
        if (headingM) {
            const level = Math.min(4, headingM[1].length);
            out.push({ kind: "heading", level, text: headingM[2] });
            i += 1;
            continue;
        }
        // Horizontal rule.
        if (HR.test(line)) {
            out.push({ kind: "rule" });
            i += 1;
            continue;
        }
        // Table — needs a separator on the next line.
        const headerM = line.match(TABLE_ROW);
        const next = lines[i + 1];
        if (headerM && next && TABLE_SEP.test(next)) {
            const headers = splitRow(headerM[1]);
            const align = parseAlign(next);
            const rows = [];
            i += 2;
            while (i < lines.length) {
                const rowM = lines[i].match(TABLE_ROW);
                if (!rowM)
                    break;
                rows.push(splitRow(rowM[1]));
                i += 1;
            }
            out.push({ kind: "table", headers, rows, align });
            continue;
        }
        // Blockquote.
        if (BLOCKQUOTE.test(line)) {
            const buf = [];
            while (i < lines.length) {
                const m = lines[i].match(BLOCKQUOTE);
                if (!m)
                    break;
                buf.push(m[1]);
                i += 1;
            }
            out.push({ kind: "blockquote", text: buf.join("\n") });
            continue;
        }
        // List (unordered or ordered).
        if (UL_ITEM.test(line) || OL_ITEM.test(line)) {
            const { items, ordered, consumed } = consumeList(lines, i);
            out.push({ kind: "list", ordered, items });
            i += consumed;
            continue;
        }
        // Paragraph — gather until blank, fence, heading, list, hr, table.
        const paraLines = [line];
        i += 1;
        while (i < lines.length) {
            const next2 = lines[i];
            if (next2.trim() === "" ||
                FENCE.test(next2) ||
                HEADING.test(next2) ||
                HR.test(next2) ||
                UL_ITEM.test(next2) ||
                OL_ITEM.test(next2) ||
                BLOCKQUOTE.test(next2) ||
                (TABLE_ROW.test(next2) && lines[i + 1] && TABLE_SEP.test(lines[i + 1]))) {
                break;
            }
            paraLines.push(next2);
            i += 1;
        }
        out.push({ kind: "paragraph", text: paraLines.join("\n") });
    }
    return out;
}
function consumeList(lines, start) {
    const items = [];
    const first = lines[start];
    const ordered = OL_ITEM.test(first);
    let i = start;
    while (i < lines.length) {
        const line = lines[i];
        const ulM = ordered ? null : line.match(UL_ITEM);
        const olM = ordered ? line.match(OL_ITEM) : null;
        if (ulM) {
            items.push({ depth: ulM[1].length, marker: ulM[2], text: ulM[3] });
            i += 1;
        }
        else if (olM) {
            items.push({ depth: olM[1].length, marker: olM[2], text: olM[3] });
            i += 1;
        }
        else {
            break;
        }
    }
    return { items, ordered, consumed: i - start };
}
function splitRow(inner) {
    return inner.split("|").map((c) => c.trim());
}
function parseAlign(sep) {
    return sep
        .replace(/^\s*\|?/, "")
        .replace(/\|?\s*$/, "")
        .split("|")
        .map((c) => c.trim())
        .map((c) => {
        const left = c.startsWith(":");
        const right = c.endsWith(":");
        if (left && right)
            return "center";
        if (right)
            return "right";
        if (left)
            return "left";
        return null;
    });
}
//# sourceMappingURL=parser.js.map