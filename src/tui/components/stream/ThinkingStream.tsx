/**
 * ThinkingStream.tsx — Clean thought streaming (NO box, NO pulsating)
 * 
 * Thoughts flow as plain italic text, like a human typing their reasoning.
 * No borders, no animations, just clean text stream.
 */

import React, { memo } from 'react';
import { Text, Box } from 'ink';
import { C } from '../../colors.js';

interface ThinkingStreamProps {
  thoughts: string[];
  isStreaming?: boolean;
}

export const ThinkingStream = memo(function ThinkingStream({
  thoughts,
  isStreaming = false,
}: ThinkingStreamProps) {
  if (thoughts.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {thoughts.map((thought, i) => (
        <Text key={i} color={C.textMuted} italic>
          {isStreaming && i === thoughts.length - 1 ? '▌ ' : ''}
          {thought}
        </Text>
      ))}
    </Box>
  );
});

export default ThinkingStream;
