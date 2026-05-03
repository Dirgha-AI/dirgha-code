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

// Maximum characters in the dynamic (live) trailing chunk.
// Beyond this, we force a split to keep the live block small.
export const MAX_LIVE_CHUNK_CHARS = 5000;

export function findLastSafeSplitPoint(content: string): number {
  // Rule 1: if the cursor is inside a fenced code block, split before it.
  const enclosingBlockStart = findEnclosingCodeBlockStart(
    content,
    content.length,
  );
  if (enclosingBlockStart !== -1) {
    return enclosingBlockStart;
  }

  // Rule 2: prefer the last \n\n (paragraph break) not inside a code block.
  let searchFrom = content.length;
  while (searchFrom >= 0) {
    const dnlIndex = content.lastIndexOf("\n\n", searchFrom);
    if (dnlIndex === -1) break;
    const candidate = dnlIndex + 2; // after the double newline
    if (!isIndexInsideCodeBlock(content, candidate)) {
      return candidate;
    }
    searchFrom = dnlIndex - 1;
  }

  // Rule 3: no safe split point found — return the full length.
  return content.length;
}

/**
 * Is the character at `index` inside a fenced code block (``` … ```)?
 */
function isIndexInsideCodeBlock(content: string, index: number): boolean {
  let blockDepth = 0;
  const fencePattern = /^[ \t]*(```)([a-zA-Z0-9+#-]*?)([ \t]*)$/gm;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fencePattern.exec(content)) !== null) {
    const fenceStart = fenceMatch.index;
    if (fenceStart >= index) break;
    const hasLanguage = fenceMatch[2].length > 0;
    const line = fenceMatch[0];
    // A fence with language or other content is an opener
    if (hasLanguage || line.trimEnd().length > 3) {
      blockDepth++;
    } else {
      if (blockDepth > 0) blockDepth--;
    }
  }
  return blockDepth > 0;
}

/**
 * Find the start of the innermost fenced code block that contains `cursor`.
 * Returns -1 if `cursor` is not inside any code block.
 */
function findEnclosingCodeBlockStart(content: string, cursor: number): number {
  let blockStart = -1;
  let blockDepth = 0;
  const pattern = /^[ \t]*(```)([a-zA-Z0-9+#-]*?)([ \t]*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match.index >= cursor) break;
    const hasLanguage = match[2].length > 0;
    const line = match[0];
    // A fence with language or other content is an opener
    if (hasLanguage || line.trimEnd().length > 3) {
      if (blockDepth === 0) blockStart = match.index;
      blockDepth++;
    } else {
      if (blockDepth > 0) {
        blockDepth--;
        if (blockDepth === 0) blockStart = -1;
      }
    }
  }
  return blockDepth > 0 ? blockStart : -1;
}
