import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';
import { TAG_COLORS } from '../constants.js';

export function ModelRow({ model, isCursor, isSelected }: any) {
  return (
    <Box paddingLeft={2} gap={1}>
      <Text color={isCursor ? C.brand : C.textDim}>{isCursor ? '>' : isSelected ? '✓' : ' '}</Text>
      <Text color={C.textDim}>{model.num <= 9 ? String(model.num) : ' '}</Text>
      <Text color={isCursor ? C.textPrimary : isSelected ? C.brand : C.textSecondary} bold={isCursor}>{model.label}</Text>
      <Text color={isCursor ? (TAG_COLORS[model.tag] ?? C.textMuted) : C.textDim}>{model.tag}</Text>
    </Box>
  );
}
