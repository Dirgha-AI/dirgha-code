/**
 * StableCursor.tsx — Cursor that maintains stable position during updates
 */

import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { StableCursorProps } from './types.js';
import { C } from '../../colors.js';

export const StableCursor = memo(function StableCursor({
  children,
  preservePosition = true,
}: StableCursorProps): React.JSX.Element {
  if (!preservePosition) {
    return <>{children}</>;
  }

  return (
    <Box flexDirection="row">
      <Box flexGrow={1}>{children}</Box>
      <Box marginLeft={1}>
        <Text color={C.accent}>▌</Text>
      </Box>
    </Box>
  );
});

export default StableCursor;
