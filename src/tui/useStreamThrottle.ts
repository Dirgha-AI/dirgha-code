import * as React from 'react';
import type { StreamEvent } from './components/stream/index.js';

/**
 * useStreamThrottle — Global render throttle for 60fps streaming.
 * Prevents UI jitter by buffering incoming tokens and only updating 
 * the React state at a capped frame rate.
 */
export function useStreamThrottle() {
  const [streamEvents, setStreamEvents] = React.useState<StreamEvent[]>([]);
  const streamBufferRef = React.useRef<StreamEvent[]>([]);
  const throttleRef = React.useRef<NodeJS.Timeout | null>(null);

  const requestRender = React.useCallback(() => {
    if (throttleRef.current) return;
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      setStreamEvents([...streamBufferRef.current]);
    }, 16); // ~60 FPS
  }, []);

  const pushEvent = React.useCallback((event: StreamEvent) => {
    streamBufferRef.current.push(event);
    requestRender();
  }, [requestRender]);

  const clearEvents = React.useCallback(() => {
    streamBufferRef.current = [];
    setStreamEvents([]);
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

  return { streamEvents, pushEvent, clearEvents };
}
