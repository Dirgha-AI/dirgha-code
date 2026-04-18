/** tui/components/SlashHint.tsx */
import React from 'react';
import { Box, Text } from 'ink';
import { SLASH_COMMANDS } from '../constants.js';
import { C } from '../colors.js';

export function SlashHint({ input }: { input: string }) {
  if (!input.startsWith('/')) return null;
  const matches = input.length === 1
    ? SLASH_COMMANDS
    : SLASH_COMMANDS.filter(c => c.startsWith(input));
  if (matches.length === 0 || (matches.length === 1 && matches[0] === input)) return null;
  const shown = matches.slice(0, 8);
  return (
    <Box paddingX={2} flexWrap="wrap" gap={2}>
      {shown.map(c => <Text key={c} color={C.brand} dimColor>{c}</Text>)}
      {matches.length > 8 && <Text color={C.textDim}>+{matches.length - 8} more</Text>}
    </Box>
  );
}
