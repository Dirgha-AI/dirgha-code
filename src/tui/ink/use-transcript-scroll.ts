/**
 * Transcript scroll hook — manages terminal-height-aware scroll state
 * and PageUp/PageDown key bindings for the virtualized transcript.
 *
 * PageUp:   scroll up by half the terminal height
 * PageDown: scroll down by half the terminal height
 *
 * When the input box is focused, only Ctrl+PageUp / Ctrl+PageDown are
 * intercepted so they don't collide with normal text navigation.
 * When the input box is NOT focused, plain PageUp/PageDown work.
 */

import * as React from "react";
import { useInput, useStdout } from "ink";

export interface TranscriptScrollState {
  scrollOffset: number;
  isAtBottom: boolean;
  scrollUp: () => void;
  scrollDown: () => void;
  scrollToBottom: () => void;
}

export function useTranscriptScroll(
  itemCount: number,
  autoScroll: boolean,
  inputFocus: boolean,
): TranscriptScrollState {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const pageStep = Math.max(1, Math.floor(rows / 2));

  const [scrollOffset, setScrollOffset] = React.useState(0);
  const userScrolledRef = React.useRef(false);
  const prevItemCountRef = React.useRef(itemCount);

  React.useEffect(() => {
    const prev = prevItemCountRef.current;
    prevItemCountRef.current = itemCount;
    if (itemCount > prev && autoScroll && !userScrolledRef.current) {
      setScrollOffset(0);
    }
  }, [itemCount, autoScroll]);

  const isAtBottom = scrollOffset === 0;

  const doScrollUp = React.useCallback(() => {
    setScrollOffset((prev) => Math.min(itemCount - 1, prev + 1));
    userScrolledRef.current = true;
  }, [itemCount]);

  const doScrollDown = React.useCallback(() => {
    setScrollOffset((prev) => {
      const next = Math.max(0, prev - 1);
      if (next === 0) userScrolledRef.current = false;
      return next;
    });
  }, []);

  const pageUp = React.useCallback(() => {
    setScrollOffset((prev) => Math.min(itemCount - 1, prev + pageStep));
    userScrolledRef.current = true;
  }, [itemCount, pageStep]);

  const pageDown = React.useCallback(() => {
    setScrollOffset((prev) => {
      const next = Math.max(0, prev - pageStep);
      if (next === 0) userScrolledRef.current = false;
      return next;
    });
  }, [pageStep]);

  const scrollToBottom = React.useCallback(() => {
    userScrolledRef.current = false;
    setScrollOffset(0);
  }, []);

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
    scrollOffset,
    isAtBottom,
    scrollUp: doScrollUp,
    scrollDown: doScrollDown,
    scrollToBottom,
  };
}
