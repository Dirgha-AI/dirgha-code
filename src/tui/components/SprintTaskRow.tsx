import React from 'react';
import { Box, Text } from 'ink';
import { getTaskIcon, getStatusColor, formatElapsed } from './SprintHelpers.js';

export function SprintTaskRow({ task }: any) {
  const color = getStatusColor(task.status);
  return (
    <Box>
      <Box width={40}><Text><Text color={color}>{getTaskIcon(task.status)}</Text> {task.taskId}</Text></Box>
      <Box width={12}><Text color={color}>{task.status}</Text></Box>
      <Box width={12}><Text>{formatElapsed(task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : 0)}</Text></Box>
      <Box width={8}><Text>{task.attempts}</Text></Box>
    </Box>
  );
}
