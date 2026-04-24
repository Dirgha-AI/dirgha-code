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

import * as React from 'react';
import { Box, Text } from 'ink';

export const PASTE_LINE_THRESHOLD = 4;
export const PASTE_CHAR_THRESHOLD = 200;

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
export function detectPaste(prev: string, next: string): PasteSegment | null {
  if (next.length - prev.length < PASTE_CHAR_THRESHOLD &&
      countLines(next) - countLines(prev) < PASTE_LINE_THRESHOLD) {
    return null;
  }
  // Locate the insertion point by finding the longest common prefix + suffix.
  let prefix = 0;
  while (prefix < prev.length && prefix < next.length && prev[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < (prev.length - prefix) &&
    suffix < (next.length - prefix) &&
    prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix += 1;
  const start = prefix;
  const end = next.length - suffix;
  if (end <= start) return null;
  const inserted = next.slice(start, end);
  return {
    start,
    end,
    lines: countLines(inserted),
    chars: inserted.length,
  };
}

function countLines(s: string): number {
  if (s === '') return 0;
  let n = 1;
  for (let i = 0; i < s.length; i += 1) if (s[i] === '\n') n += 1;
  return n;
}

export interface PasteCollapseViewProps {
  value: string;
  segment: PasteSegment;
  expanded: boolean;
}

/**
 * Renders the buffer with the pasted region collapsed behind a
 * placeholder when `expanded` is false. Always renders a small
 * hint so the user knows Ctrl+E toggles it.
 */
export function PasteCollapseView(props: PasteCollapseViewProps): React.JSX.Element {
  const { value, segment, expanded } = props;
  if (expanded) {
    return (
      <Box flexDirection="column">
        <Text>{value}</Text>
        <Text color="gray" dimColor>
          [{segment.lines} line{segment.lines === 1 ? '' : 's'}, {segment.chars} chars expanded · Ctrl+E to collapse]
        </Text>
      </Box>
    );
  }
  const before = value.slice(0, segment.start);
  const after = value.slice(segment.end);
  return (
    <Box flexDirection="row" flexWrap="wrap">
      <Text>{before}</Text>
      <Text color="yellow">
        [{segment.lines} line{segment.lines === 1 ? '' : 's'} pasted, {segment.chars} chars]
      </Text>
      <Text>{after}</Text>
      <Text color="gray" dimColor> · Ctrl+E expand</Text>
    </Box>
  );
}
