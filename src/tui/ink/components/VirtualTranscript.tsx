/**
 * Virtualised transcript list — always-on viewport slicing.
 *
 * Renders only the items within the visible terminal viewport plus a
 * 5-item buffer above and below. Uses pinned-absolute-index scrolling
 * so the viewport never shifts when new items arrive mid-scroll.
 *
 * When items exist below the viewport, a `[N items below · ↓ see]`
 * indicator is shown. When items exist above, a `[N items above]`
 * indicator is shown.
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

  // Reserve rows for prompt + status lines below the transcript.
  const buffer = 5;
  const visibleCount = Math.max(1, rows - buffer);

  const { pinnedEndIdx, isAtBottom, belowCount } = useTranscriptScroll(
    items.length,
    visibleCount,
    autoScroll,
    inputFocus,
  );

  // Slice the viewport: show `visibleCount` items ending at `pinnedEndIdx`,
  // with an extra `buffer` items above for smooth scroll-out.
  const endIdx = pinnedEndIdx;
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
      {belowCount > 0 && (
        <Box>
          <Text dimColor>
            [{belowCount} item{belowCount !== 1 ? "s" : ""} below · PageDown]
          </Text>
        </Box>
      )}
      {!isAtBottom && (
        <Box>
          <Text dimColor>
            [at item {pinnedEndIdx}/{items.length} · End to follow]
          </Text>
        </Box>
      )}
    </Box>
  );
});
