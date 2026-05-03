/**
 * Virtualised transcript list for long sessions.
 *
 * Renders only the items within the visible terminal viewport plus a
 * 5-item buffer above and below.  Item count is used as a rough proxy
 * for lines — the goal is to keep the in-memory render tree small
 * rather than achieving pixel-perfect viewport clipping.
 *
 * When scrolled above the bottom, a `[N items above]` spacer is shown.
 */

import * as React from "react";
import { Box, Text, useStdout } from "ink";
import type { TranscriptItem } from "../use-event-projection.js";
import { useTranscriptScroll } from "../use-transcript-scroll.js";

export interface VirtualTranscriptProps {
  items: TranscriptItem[];
  renderItem: (item: TranscriptItem) => React.ReactNode;
  autoScroll: boolean;
  inputFocus: boolean;
}

export const VirtualTranscript = React.memo(function VirtualTranscript(
  props: VirtualTranscriptProps,
): React.JSX.Element {
  const { items, renderItem, autoScroll, inputFocus } = props;
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;

  const { scrollOffset, isAtBottom } = useTranscriptScroll(
    items.length,
    autoScroll,
    inputFocus,
  );

  const buffer = 5;
  const visibleCount = Math.max(1, rows - buffer);
  const endIdx = items.length - scrollOffset;
  // visibleCount already subtracts buffer. Only subtract one more buffer
  // (not two) so the viewport doesn't shrink by double.
  const visibleStart = Math.max(0, endIdx - visibleCount);
  const paddedStart = Math.max(0, visibleStart - buffer);
  const visibleItems = items.slice(paddedStart, endIdx);

  const aboveCount = paddedStart;

  return (
    <Box flexDirection="column">
      {aboveCount > 0 && (
        <Box>
          <Text dimColor>
            [{aboveCount} item{aboveCount !== 1 ? "s" : ""} above]
          </Text>
        </Box>
      )}
      {visibleItems.map((item) => (
        <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
      ))}
      {!isAtBottom && scrollOffset > 0 && (
        <Box>
          <Text dimColor>
            [{scrollOffset} item{scrollOffset !== 1 ? "s" : ""} below]
          </Text>
        </Box>
      )}
    </Box>
  );
});
