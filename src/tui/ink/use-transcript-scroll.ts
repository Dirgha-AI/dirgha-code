/**
 * Transcript scroll hook — pinned-absolute-index virtual scrolling.
 *
 * Instead of a relative offset from bottom (which shifts when new items
 * arrive), this uses a pinnedEndIdx — the absolute index of the last
 * visible item. When the user scrolls up, pinnedEndIdx stays fixed so
 * new streaming items never push the viewport. Auto-scroll only fires
 * when the user was at the bottom before the new item arrived.
 *
 * PageUp:   scroll up by half the terminal height (≈ 4 items at 24 rows)
 * PageDown: scroll down by half the terminal height
 *
 * When the input box is focused, only Ctrl+PageUp / Ctrl+PageDown are
 * intercepted so they don't collide with normal text navigation.
 * When the input box is NOT focused, plain PageUp/PageDown work.
 */

import * as React from "react";
import { useInput, useStdout } from "ink";

export interface TranscriptScrollState {
  /** Absolute index of the last visible item (exclusive end bound). */
  pinnedEndIdx: number;
  /** True when pinnedEndIdx >= itemCount (viewing the live tail). */
  isAtBottom: boolean;
  /** Number of items below the current viewport (items.length - pinnedEndIdx). */
  belowCount: number;
  scrollUp: () => void;
  scrollDown: () => void;
  scrollToBottom: () => void;
}

export function useTranscriptScroll(
  itemCount: number,
  visibleCount: number,
  autoScroll: boolean,
  inputFocus: boolean,
): TranscriptScrollState {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const pageStep = Math.max(1, Math.floor(rows / 6));

  // pinnedEndIdx is the absolute index of the LAST visible item.
  // Initial value: itemCount (viewing the live tail).
  const [pinnedEndIdx, setPinnedEndIdx] = React.useState(itemCount);
  const userScrolledRef = React.useRef(false);
  const prevItemCountRef = React.useRef(itemCount);

  // When new items arrive at the bottom, auto-advance pinnedEndIdx
  // ONLY if the user was already at the bottom (userScrolledRef is false).
  // This is the key fix: if the user scrolled up, new items don't shift
  // the viewport — the belowCount grows instead.
  React.useEffect(() => {
    const prev = prevItemCountRef.current;
    prevItemCountRef.current = itemCount;
    if (itemCount > prev && autoScroll && !userScrolledRef.current) {
      // User was at bottom — follow new content.
      setPinnedEndIdx(itemCount);
    }
  }, [itemCount, autoScroll]);

  const isAtBottom = pinnedEndIdx >= itemCount;
  const belowCount = Math.max(0, itemCount - pinnedEndIdx);

  const doScrollUp = React.useCallback(() => {
    setPinnedEndIdx((prev) => {
      // Never scroll past the first visibleCount items so there's always
      // content on screen. Clamp to at least visibleCount.
      const next = Math.max(visibleCount, prev - 1);
      userScrolledRef.current = true;
      return next;
    });
  }, [visibleCount]);

  const doScrollDown = React.useCallback(() => {
    setPinnedEndIdx((prev) => {
      const next = Math.min(itemCount, prev + 1);
      if (next >= itemCount) userScrolledRef.current = false;
      return next;
    });
  }, [itemCount]);

  const pageUp = React.useCallback(() => {
    setPinnedEndIdx((prev) => {
      const next = Math.max(visibleCount, prev - pageStep);
      userScrolledRef.current = true;
      return next;
    });
  }, [pageStep, visibleCount]);

  const pageDown = React.useCallback(() => {
    setPinnedEndIdx((prev) => {
      const next = Math.min(itemCount, prev + pageStep);
      if (next >= itemCount) userScrolledRef.current = false;
      return next;
    });
  }, [pageStep, itemCount]);

  const scrollToBottom = React.useCallback(() => {
    userScrolledRef.current = false;
    setPinnedEndIdx(itemCount);
  }, [itemCount]);

  useInput(
    (_ch, key) => {
      if (inputFocus) {
        if (key.ctrl && key.pageUp) {
          pageUp();
        } else if (key.ctrl && key.pageDown) {
          pageDown();
        }
      } else {
        if (key.pageUp) {
          pageUp();
        } else if (key.pageDown) {
          pageDown();
        }
      }
    },
    { isActive: true },
  );

  return {
    pinnedEndIdx,
    isAtBottom,
    belowCount,
    scrollUp: doScrollUp,
    scrollDown: doScrollDown,
    scrollToBottom,
  };
}
