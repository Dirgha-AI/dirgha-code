/**
 * useDoubleBuffer.ts — Double buffering hook for smooth updates
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface DoubleBufferResult<T> {
  front: T;
  back: T;
  swap: () => void;
}

export function useDoubleBuffer<T>(
  currentValue: T,
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): DoubleBufferResult<T> {
  const [front, setFront] = useState<T>(currentValue);
  const [back, setBack] = useState<T>(currentValue);
  const backRef = useRef<T>(currentValue);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!comparator(currentValue, backRef.current)) {
      backRef.current = currentValue;
      setBack(currentValue);
    }
  }, [currentValue, comparator]);

  const swap = useCallback(() => {
    frameCount.current++;
    if (frameCount.current % 2 === 0) {
      setFront(backRef.current);
    }
  }, []);

  return { front, back, swap };
}
