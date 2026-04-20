import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';
import { ErrorMsg } from './ErrorMsg.js';

export function CompletedSystemMsg({ msg }: { msg: any }) {
  if (msg.isLogo) {
    const lines = msg.content.split('\n');
    return (
      <Box paddingX={2} flexDirection="column" marginBottom={1}>
        {lines.map((line: string, i: number) => (!line.trim() && i === 0) ? null : <Text key={i}>{line}</Text>)}
      </Box>
    );
  }
  if (msg.isDim) return <Box paddingX={2}><Text color={C.textDim}>{msg.content}</Text></Box>;
  if (msg.content.startsWith('✗')) return <ErrorMsg message={msg.content.replace(/^✗\s*/, '')} />;
  return <Box paddingX={2}><Text color={C.textMuted}>{msg.content}</Text></Box>;
}
