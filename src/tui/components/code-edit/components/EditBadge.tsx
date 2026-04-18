/**
 * EditBadge.tsx — Pill-shaped badge showing edit type
 */

import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { EditType } from '../types.js';
import { getTypeColor, getTypeLabel } from '../utils.js';

interface EditBadgeProps {
  type: EditType;
}

export const EditBadge = memo(function EditBadge({ type }: EditBadgeProps) {
  const color = getTypeColor(type);
  const label = getTypeLabel(type);

  return (
    <Box
      paddingX={1}
      borderStyle="round"
      borderColor={color}
      backgroundColor={color + '20'}
    >
      <Text bold color={color}>
        {label}
      </Text>
    </Box>
  );
});

export default EditBadge;
