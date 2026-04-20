/**
 * ThinkingStream.tsx — Compact thought display
 *
 * Joins all thought chunks into one text block, shows last 3 non-empty lines.
 * Used as a standalone component when the caller manages thought chunks directly.
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

  const fullText = thoughts.join('');
  const lines = fullText.split('\n').filter(l => l.trim()).slice(-3);

  if (lines.length === 0) return null;

  return (
    <Box flexDirection="column" gap={0} marginBottom={1}>
      <Box gap={1}>
        <Text color={C.textDim}>{isStreaming ? '∇' : '∎'}</Text>
        <Text color={C.textDim}>thinking</Text>
      </Box>
      {lines.map((line, i) => (
        <Box key={i} paddingLeft={2}>
          <Text color={C.textDim} dimColor wrap="wrap">{line}</Text>
        </Box>
      ))}
    </Box>
  );
});

export default ThinkingStream;
