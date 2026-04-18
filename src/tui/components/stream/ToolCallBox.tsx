// @ts-nocheck
/**
 * ToolCallBox.tsx — Individual tool call in a contained box
 * 
 * Each tool gets its own round-corner box showing:
 * - Tool icon/name at top
 * - Arguments (collapsed by default)
 * - Execution status (pending → running → done/error)
 * - Result preview when complete
 */

import React, { memo, useState } from 'react';
import { Box, Text } from 'ink';
import { C } from '../../colors.js';

export type ToolStatus = 'pending' | 'running' | 'done' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  status: ToolStatus;
  result?: string;
  error?: string;
}

interface ToolCallBoxProps {
  tool: ToolCall;
}

const STATUS_ICONS: Record<ToolStatus, string> = {
  pending: '○',
  running: '◐',
  done: '✓',
  error: '✗',
};

const STATUS_COLORS: Record<ToolStatus, string> = {
  pending: C.textFaint,
  running: C.accent,
  done: '#50fa7b',
  error: '#ff5555',
};

export const ToolCallBox = memo(function ToolCallBox({ tool }: ToolCallBoxProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = STATUS_ICONS[tool.status];
  const color = STATUS_COLORS[tool.status];

  return (
    <Box
      flexDirection="column"
      marginY={1}
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={color}
    >
      {/* Header: Icon + Tool Name */}
      <Box flexDirection="row" onPress={() => setExpanded(!expanded)}>
        <Text color={color}>{icon}</Text>
        <Text bold color={C.textPrimary}>
          {' '}{tool.name}
        </Text>
        {expanded && (
          <Text color={C.textFaint}> (click to collapse)</Text>
        )}
      </Box>

      {/* Arguments (when expanded) */}
      {expanded && Object.keys(tool.args).length > 0 && (
        <Box marginLeft={2} marginTop={1} flexDirection="column">
          <Text color={C.textFaint}>Arguments:</Text>
          {Object.entries(tool.args).map(([key, val]) => (
            <Box key={key} marginLeft={2}>
              <Text color={C.accent}>  {key}:</Text>
              <Text color={C.textSecondary}>
                {' '}{typeof val === 'string' ? val : JSON.stringify(val).slice(0, 50)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Result preview */}
      {tool.status === 'done' && tool.result && !expanded && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={C.textFaint}>
            {tool.result.slice(0, 60)}{tool.result.length > 60 ? '...' : ''}
          </Text>
        </Box>
      )}

      {/* Error */}
      {tool.status === 'error' && tool.error && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="#ff5555">{tool.error}</Text>
        </Box>
      )}
    </Box>
  );
});

export default ToolCallBox;
