import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';

export function LocalModelRow({ model, isCursor, exists, running }: any) {
  const statusText = running && exists ? '● running' : exists ? '✓ downloaded' : '↓ /setup local';
  const statusColor = running && exists ? C.brand : exists ? '#10B981' : C.textMuted;
  return (
    <Box paddingLeft={2} gap={1}>
      <Text color={isCursor ? C.brand : C.textDim}>{isCursor ? '>' : ' '}</Text>
      <Text color={isCursor ? C.textPrimary : C.textSecondary} bold={isCursor}>{model.name}</Text>
      <Text color={C.textDim}>{model.sizeGB} GB</Text>
      <Text color={C.textDim}>{model.provider}</Text>
      <Text color={statusColor}>{statusText}</Text>
    </Box>
  );
}
