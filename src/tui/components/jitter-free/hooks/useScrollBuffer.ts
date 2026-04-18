/**
 * useScrollBuffer.ts — Scroll position buffering for smooth scrolling
 */

import { useRef, useCallback } from 'react';
import { globalFrameController } from '../FrameController.js';

interface ScrollBufferResult {
  bufferScroll: (scrollFn: () => void) => void;
  flush: () => void;
}

export function useScrollBuffer(): ScrollBufferResult {
  const pendingScroll = useRef<(() => void) | null>(null);

  const bufferScroll = useCallback((scrollFn: () => void) => {
    pendingScroll.current = scrollFn;
    globalFrameController.schedule(() => {
      if (pendingScroll.current) {
        pendingScroll.current();
        pendingScroll.current = null;
      }
    });
  }, []);

  const flush = useCallback(() => {
    if (pendingScroll.current) {
      pendingScroll.current();
      pendingScroll.current = null;
    }
  }, []);

  return { bufferScroll, flush };
}
