import React, { memo, useState } from 'react';
import { Box, Text } from 'ink';
import { C } from '../../colors.js';
import { ToolCallArgs } from './ToolCallArgs.js';

export type ToolStatus = 'pending' | 'running' | 'done' | 'error';
export interface ToolCall { id: string; name: string; args: Record<string, any>; status: ToolStatus; result?: string; error?: string; }

const ICONS: Record<ToolStatus, string> = { pending: '○', running: '◐', done: '✓', error: '✗' };
const COLORS: Record<ToolStatus, string> = { pending: C.textDim, running: C.accent, done: '#50fa7b', error: '#ff5555' };

export const ToolCallBox = memo(function ToolCallBox({ tool }: { tool: ToolCall }) {
  const [exp, setExp] = useState(false);
  const icon = ICONS[tool.status], color = COLORS[tool.status];

  return (
    <Box flexDirection="column" marginY={1} paddingX={2} paddingY={1} borderStyle="round" borderColor={color}>
      <Box flexDirection="row">
        <Text color={color}>{icon}</Text>
        <Text bold color={C.textPrimary}>{' '}{tool.name}</Text>
        {exp && <Text color={C.textDim}> (expanded)</Text>}
      </Box>

      {exp && Object.keys(tool.args).length > 0 && <ToolCallArgs args={tool.args} />}

      {tool.status === 'done' && tool.result && !exp && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={C.textDim}>{tool.result.slice(0, 60)}...</Text>
        </Box>
      )}

      {tool.status === 'error' && tool.error && (
        <Box marginLeft={2} marginTop={1}><Text color="#ff5555">{tool.error}</Text></Box>
      )}
    </Box>
  );
});
