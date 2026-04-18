/** tui/components/ErrorMsg.tsx — Structured error display with recovery hint */
import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';

const RECOVERY: Record<string, string> = {
  'Not authenticated':        'run /login to connect',
  'API key':                  'run /keys to configure',
  'No project':               'run /init to scan this directory',
  'Permission denied':        'switch to /yolo or grant access',
  'context length':           'run /compact to reduce history',
  'rate limit':               'wait a moment and retry',
  'Network':                  'check your connection',
};

function hint(msg: string): string | null {
  for (const [k, v] of Object.entries(RECOVERY)) {
    if (msg.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return null;
}

export function ErrorMsg({ message }: { message: string }) {
  const recovery = hint(message);
  return (
    <Box
      flexDirection="column" paddingX={2} marginTop={1}
      borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false}
      borderColor={C.error}
    >
      <Box gap={1}>
        <Text color={C.error} bold>✗</Text>
        <Text color={C.textSecondary}>{message}</Text>
      </Box>
      {recovery && <Text color={C.textDim}>  → {recovery}</Text>}
    </Box>
  );
}
