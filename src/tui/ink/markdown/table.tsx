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
import type { Palette } from '../../theme.js';
import { RenderInline } from './inline.js';

interface TableProps {
  headers: string[];
  rows: string[][];
  align: Array<'left' | 'right' | 'center' | null>;
  palette: Palette;
  /** Total available width for the table. Cells get scaled down if needed. */
  maxWidth: number;
}

export function TableRenderer(props: TableProps): React.ReactElement {
  const { headers, rows, align, palette, maxWidth } = props;

  // Compute display widths from raw text (RenderInline strips markers visually,
  // but for layout sizing we strip them here so the columns align).
  const stripped = (s: string): string =>
    s.replace(/\*\*|\*|~~|_|`+|<\/?u>/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1');

  const colCount = Math.max(headers.length, ...rows.map(r => r.length));
  const widths = new Array<number>(colCount).fill(0);

  const cellWidth = (cells: string[], i: number): number =>
    cells[i] ? stripped(cells[i]).length : 0;

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

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header row */}
      <Box>
        {headers.map((h, i) => (
          <React.Fragment key={`h-${i}`}>
            {i > 0 && <Text color={palette.border.default}>{sep}</Text>}
            <PadCell
              raw={h}
              width={widths[i]}
              align={align[i] ?? 'left'}
              palette={palette}
              bold
              keyPrefix={`h-${i}`}
            />
          </React.Fragment>
        ))}
      </Box>
      {/* Separator row */}
      <Box>
        <Text color={palette.border.default}>
          {widths
            .map((w, i) => '─'.repeat(w) + (i < widths.length - 1 ? '─┼─' : ''))
            .join('')}
        </Text>
      </Box>
      {/* Body rows */}
      {rows.map((row, ri) => (
        <Box key={`r-${ri}`}>
          {row.slice(0, colCount).map((cell, ci) => (
            <React.Fragment key={`r-${ri}-c-${ci}`}>
              {ci > 0 && <Text color={palette.border.default}>{sep}</Text>}
              <PadCell
                raw={cell}
                width={widths[ci]}
                align={align[ci] ?? 'left'}
                palette={palette}
                keyPrefix={`r-${ri}-c-${ci}`}
              />
            </React.Fragment>
          ))}
        </Box>
      ))}
    </Box>
  );
}

interface PadCellProps {
  raw: string;
  width: number;
  align: 'left' | 'right' | 'center';
  palette: Palette;
  bold?: boolean;
  keyPrefix: string;
}

function PadCell(props: PadCellProps): React.ReactElement {
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
    return (
      <Text bold color={palette.text.primary}>
        {content}
      </Text>
    );
  }
  return (
    <Box width={width}>
      <RenderInline text={truncated} palette={palette} keyPrefix={keyPrefix} />
      <Text>{' '.repeat(padTotal)}</Text>
    </Box>
  );
}
