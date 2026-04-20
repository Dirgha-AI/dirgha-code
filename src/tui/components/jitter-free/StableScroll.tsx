/**
 * StableScroll.tsx — Smooth scrolling container with RAF-based updates
 */

import React, { useRef, useEffect, memo } from 'react';
import { Box } from 'ink';
import { StableScrollProps } from './types.js';
import { useScrollBuffer } from './hooks/index.js';

export const StableScroll = memo(function StableScroll({
  children,
  smooth = true,
}: StableScrollProps): React.JSX.Element {
  // @ts-ignore — ink's Box ForwardRefExoticComponent doesn't satisfy abstract new() constraint
  const containerRef = useRef<InstanceType<typeof Box>>(null);
  const { bufferScroll, flush } = useScrollBuffer();
  const scrollPos = useRef(0);

  useEffect(() => {
    if (!smooth || !containerRef.current) return;

    bufferScroll(() => {
      scrollPos.current += 1;
      flush();
    });

    return () => {
      flush();
    };
  }, [children, smooth, bufferScroll, flush]);

  return (
    <Box ref={containerRef} flexDirection="column" overflow="hidden">
      {children}
    </Box>
  );
});

export default StableScroll;
