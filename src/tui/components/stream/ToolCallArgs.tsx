import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../../colors.js';

export function ToolCallArgs({ args }: { args: Record<string, any> }) {
  return (
    <Box marginLeft={2} marginTop={1} flexDirection="column">
      <Text color={C.textDim}>Arguments:</Text>
      {Object.entries(args).map(([key, val]) => (
        <Box key={key} marginLeft={2}>
          <Text color={C.accent}>  {key}:</Text>
          <Text color={C.textSecondary}>
            {' '}{typeof val === 'string' ? val : JSON.stringify(val).slice(0, 50)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
