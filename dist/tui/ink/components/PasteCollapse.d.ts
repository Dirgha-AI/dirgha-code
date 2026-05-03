/**
 * Paste-collapse helpers for InputBox.
 *
 * When a single keystroke tick grows the buffer by a large margin, the
 * pasted block is hidden behind a `[N lines pasted, X chars]` placeholder
 * so the prompt stays legible. Ctrl+E toggles expansion.
 *
 * The real content lives in the backing buffer passed to `onSubmit`, so
 * Enter still submits the full text — only the rendering is collapsed.
 */
import * as React from "react";
import type { Palette } from "../../theme.js";
export declare const PASTE_LINE_THRESHOLD = 4;
export declare const PASTE_CHAR_THRESHOLD = 200;
export interface PasteSegment {
    start: number;
    end: number;
    lines: number;
    chars: number;
}
/**
 * Returns a segment describing a just-pasted block when the delta between
 * two consecutive buffer values looks like a paste. Returns null when the
 * change looks like ordinary typing.
 */
export declare function detectPaste(prev: string, next: string): PasteSegment | null;
export interface PasteCollapseViewProps {
    value: string;
    segment: PasteSegment;
    expanded: boolean;
    palette: Palette;
}
/**
 * Renders the buffer with the pasted region collapsed behind a
 * placeholder when `expanded` is false. Always renders a small
 * hint so the user knows Ctrl+E toggles it.
 */
export declare function PasteCollapseView(props: PasteCollapseViewProps): React.JSX.Element;
