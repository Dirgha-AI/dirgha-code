/**
 * DiffView — Cursor/Claude-style full-line background diff renderer.
 *
 * Renders each diff line as a Box with backgroundColor set to green (added),
 * red (removed), or transparent (context). The Box is `width={cols}` so the
 * color fills the full terminal row — not just the text area. Line numbers
 * are columnar and dim.
 *
 * Stable: accepts the diff once, no streaming updates per line, so Ink doesn't
 * re-render per character. The caller (LiveView) only mounts this after the
 * editing tool completes.
 */
import React, { memo } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { DiffLine } from '../../types.js';
import { C } from '../colors.js';

interface Props {
  path: string;
  diff: DiffLine[];
  stats?: { added: number; removed: number };
  /** Max lines to render inline. Truncates with a "…N more" footer. */
  maxLines?: number;
}

// Solid, high-contrast fills that read cleanly on both dark and light terminals.
// We intentionally do NOT reuse theme tokens here — those are chosen for text
// foregrounds, and full-line background fills need more saturated colors to
// feel like "lit up" rows rather than tinted text.
const BG_ADDED = '#0d3f21';      // deep green, readable under white text
const BG_REMOVED = '#4a1216';    // deep red, readable under white text
const BG_HUNK_GUTTER = '#1b2430';

const MARK_ADDED = '#22c55e';    // the "+" sigil
const MARK_REMOVED = '#ef4444';  // the "-" sigil
const NUM_COLOR = '#6b7280';

function padNum(n: number | undefined, w: number): string {
  if (n === undefined) return ' '.repeat(w);
  const s = String(n);
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

/** Detect the "@@ ... @@" hunk header shape — we'll render it on its own row. */
function isHunkHeader(text: string): boolean {
  return /^@@\s.+?\s@@/.test(text);
}

export const DiffView = memo(function DiffView({ path, diff, stats, maxLines = 40 }: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  // Determine line-number column width from the largest number we'll show
  let maxOld = 0, maxNew = 0;
  for (const l of diff) {
    if (l.oldNum !== undefined && l.oldNum > maxOld) maxOld = l.oldNum;
    if (l.newNum !== undefined && l.newNum > maxNew) maxNew = l.newNum;
  }
  const oldWidth = String(maxOld).length;
  const newWidth = String(maxNew).length;

  const shown = diff.slice(0, maxLines);
  const hidden = diff.length - shown.length;

  // Prefix glyph + bg + fg per kind. Single-char prefix keeps alignment tight.
  const kindStyle = (kind: DiffLine['kind']) => {
    if (kind === '+') return { bg: BG_ADDED,    mark: '+', markColor: MARK_ADDED,   textColor: '#e6ffe9' };
    if (kind === '-') return { bg: BG_REMOVED,  mark: '-', markColor: MARK_REMOVED, textColor: '#ffe6e7' };
    return { bg: undefined as string | undefined, mark: ' ', markColor: NUM_COLOR, textColor: C.textSecondary };
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header: ● path  +added -removed */}
      <Box>
        <Text color={C.brand}>●</Text>
        <Text color={C.textPrimary}> {path}</Text>
        {stats && (
          <Text color={C.textDim}>
            {'  '}
            <Text color={MARK_ADDED}>+{stats.added}</Text>
            <Text color={C.textDim}> </Text>
            <Text color={MARK_REMOVED}>-{stats.removed}</Text>
          </Text>
        )}
      </Box>

      {/* Diff body */}
      {shown.map((line, idx) => {
        // Hunk header gets its own muted row — keeps the block readable.
        if (isHunkHeader(line.text)) {
          return (
            <Box key={idx} width={cols} backgroundColor={BG_HUNK_GUTTER}>
              <Text color={C.textDim}>  {line.text}</Text>
            </Box>
          );
        }

        const { bg, mark, markColor, textColor } = kindStyle(line.kind);
        const oldCol = padNum(line.oldNum, oldWidth);
        const newCol = padNum(line.newNum, newWidth);
        const body = line.text.replace(/\t/g, '  ');
        // Clip to terminal width minus gutter+mark+padding so we never wrap
        // (wrapping would break the "one logical line per row" invariant that
        // makes the green/red blocks look like Claude's diffs).
        const gutter = oldWidth + 1 + newWidth + 1 + 2; // nums + space + mark + margins
        const room = Math.max(0, cols - gutter - 1);
        const clipped = body.length > room ? body.slice(0, Math.max(0, room - 1)) + '…' : body;
        // Pad the row to full width so the background color fills the whole
        // terminal line, not just up to the last character of content.
        const padRight = ' '.repeat(Math.max(0, room - clipped.length));

        return (
          <Box key={idx} width={cols} backgroundColor={bg}>
            <Text color={NUM_COLOR}>{oldCol} </Text>
            <Text color={NUM_COLOR}>{newCol} </Text>
            <Text color={markColor} bold>{mark}</Text>
            <Text color={textColor}> {clipped}{padRight}</Text>
          </Box>
        );
      })}

      {hidden > 0 && (
        <Box>
          <Text color={C.textDim}>  …{hidden} more line{hidden === 1 ? '' : 's'}</Text>
        </Box>
      )}
    </Box>
  );
});
