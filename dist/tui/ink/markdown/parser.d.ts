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
 * Adapted from gemini-cli's MarkdownDisplay.tsx parsing loop
 * (Apache-2.0). Logic preserved; types & module structure are
 * dirgha-native so the renderer can iterate plain data.
 */
export type Block = {
    kind: 'heading';
    level: 1 | 2 | 3 | 4;
    text: string;
} | {
    kind: 'paragraph';
    text: string;
} | {
    kind: 'code';
    lang: string | null;
    lines: string[];
} | {
    kind: 'list';
    ordered: boolean;
    items: ListItem[];
} | {
    kind: 'rule';
} | {
    kind: 'table';
    headers: string[];
    rows: string[][];
    align: Array<'left' | 'right' | 'center' | null>;
} | {
    kind: 'blockquote';
    text: string;
} | {
    kind: 'blank';
};
export interface ListItem {
    /** Indentation depth (column where the marker started). */
    depth: number;
    /** Bullet char for unordered (-, *, +) or string number for ordered (`1`, `2`). */
    marker: string;
    text: string;
}
export declare function parse(text: string): Block[];
