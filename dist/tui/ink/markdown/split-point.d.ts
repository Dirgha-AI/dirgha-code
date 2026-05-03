/**
 * Markdown-aware safe split point finder.
 *
 * Ported from @google/gemini-cli's `markdownUtilities.findLastSafeSplitPoint`.
 * During streaming, when the accumulated text gets large, we split it at
 * safe boundaries and push the older portion into committed history (which
 * lives in Ink's <Static>), keeping only the trailing chunk dynamic.
 *
 * Rules:
 *   1. Never split inside a fenced code block (``` … ```)
 *   2. Prefer paragraph breaks (\n\n) that are not inside code blocks
 *   3. Fall back to returning content.length (no split)
 */
export declare const MAX_LIVE_CHUNK_CHARS = 5000;
export declare function findLastSafeSplitPoint(content: string): number;
