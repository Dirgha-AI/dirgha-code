import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';

export function LiveThinkingNode({ i, text, isActive, dim }: any) {
  const lines = (text ?? '').split('\n').filter((l: string) => l.trim()).slice(-3);
  return (
    <Box key={`th-${i}`} flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={isActive ? (dim ? C.textMuted : C.brand) : C.textDim} dimColor={isActive ? dim : true}>
          {isActive ? '∇' : '∎'}
        </Text>
        <Text color={isActive ? C.textMuted : C.textDim}>thinking</Text>
      </Box>
      {isActive && lines.map((line: string, li: number) => (
        <Box key={li} paddingLeft={2}><Text color={C.textDim} wrap="wrap">{line}</Text></Box>
      ))}
    </Box>
  );
}
