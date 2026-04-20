/**
 * EditItem.tsx — Individual code edit item with expand/collapse
 */

import React, { memo, useState } from 'react';
import { Box, Text } from 'ink';
import { EditItemProps } from '../types.js';
import { getTypeColor } from '../utils.js';
import { C } from '../../../colors.js';
import { EditBadge } from './EditBadge.js';
import { SyntaxHighlighter } from './SyntaxHighlighter.js';

export const EditItem = memo(function EditItem({
  edit,
  showLineNumbers,
}: EditItemProps) {
  const [expanded, setExpanded] = useState(false);
  const color = getTypeColor(edit.type);

  const lineInfo = edit.lineStart !== undefined
    ? `L${edit.lineStart}${edit.lineEnd && edit.lineEnd !== edit.lineStart ? `-${edit.lineEnd}` : ''}`
    : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box flexDirection="row">
        <EditBadge type={edit.type} />
        <Box marginLeft={1} flexGrow={1}>
          <Text bold color={C.textPrimary}>{edit.path}</Text>
        </Box>
        {lineInfo && (
          <Text color={C.textFaint}>{lineInfo}</Text>
        )}
      </Box>

      {/* Description */}
      {edit.description && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={C.textSecondary}>{edit.description}</Text>
        </Box>
      )}

      {/* Content preview */}
      {expanded && (
        <Box
          marginLeft={2}
          marginTop={1}
          borderStyle="single"
          borderColor={color + '40'}
          paddingX={1}
          flexDirection="column"
        >
          {showLineNumbers && edit.lineStart !== undefined && (
            <Box flexDirection="row">
              <Box width={4}>
                <Text color={C.textFaint}>{edit.lineStart}</Text>
              </Box>
              <Box flexGrow={1}>
                <SyntaxHighlighter code={edit.newContent} path={edit.path} />
              </Box>
            </Box>
          )}
          {!showLineNumbers && (
            <SyntaxHighlighter code={edit.newContent} path={edit.path} />
          )}
        </Box>
      )}
    </Box>
  );
});

export default EditItem;
