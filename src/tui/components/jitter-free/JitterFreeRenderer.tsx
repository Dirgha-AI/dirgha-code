/**
 * JitterFreeRenderer.tsx — Main component for jitter-free streaming output
 */

import React, { memo } from 'react';
import { Box } from 'ink';
import { JitterFreeRendererProps } from './types.js';
import { globalFrameController } from './FrameController.js';
import { useDoubleBuffer } from './hooks/index.js';

export const JitterFreeRenderer = memo(function JitterFreeRenderer({
  children,
  stableHeight = true,
  reducedMotion = false,
}: JitterFreeRendererProps): React.JSX.Element {
  const { front, back, swap } = useDoubleBuffer<React.ReactNode>(children);

  React.useEffect(() => {
    globalFrameController.schedule(() => {
      swap();
    });
  }, [children, swap]);

  if (reducedMotion) {
    return <Box>{children}</Box>;
  }

  return (
    <Box
      height={stableHeight ? '100%' : undefined}
      overflow="hidden"
    >
      {front}
    </Box>
  );
});

export default JitterFreeRenderer;
