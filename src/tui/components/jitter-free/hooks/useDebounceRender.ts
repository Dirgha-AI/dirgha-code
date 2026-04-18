/**
 * useDebounceRender.ts — Debounced rendering hook
 */

import { useRef, useEffect, useCallback } from 'react';
import { DEBOUNCE_MS } from '../config.js';

interface DebounceRenderResult {
  scheduleRender: (renderFn: () => void) => void;
  cancelRender: () => void;
}

export function useDebounceRender(): DebounceRenderResult {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const frameRef = useRef<number | null>(null);

  const scheduleRender = useCallback((renderFn: () => void) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      frameRef.current = requestAnimationFrame(() => {
        renderFn();
        frameRef.current = null;
      });
    }, DEBOUNCE_MS);
  }, []);

  const cancelRender = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  useEffect(() => cancelRender, [cancelRender]);

  return { scheduleRender, cancelRender };
}
