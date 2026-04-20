/**
 * CodeEditBox.tsx — Main container for code edit visualization
 */

import React, { memo, useState } from 'react';
import { Box, Text } from 'ink';
import { C } from '../../colors.js';
import { CodeEditBoxProps } from './types.js';
import { EditItem } from './components/EditItem.js';

export const CodeEditBox = memo(function CodeEditBox({
  edits,
  maxHeight = 20,
  showLineNumbers = true,
}: CodeEditBoxProps): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleEdits = edits.slice(0, maxHeight);
  const hasMore = edits.length > maxHeight;

  return (
    <Box flexDirection="column" overflow="hidden">
      {visibleEdits.map((edit) => (
        <EditItem
          key={edit.id}
          edit={edit}
          isExpanded={expandedId === edit.id}
          onToggle={() => setExpandedId(expandedId === edit.id ? null : edit.id)}
          showLineNumbers={showLineNumbers}
        />
      ))}

      {hasMore && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={C.textFaint}>
            +{edits.length - maxHeight} more edits...
          </Text>
        </Box>
      )}
    </Box>
  );
});

export default CodeEditBox;
