import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';
import type { StreamEvent } from './stream/types.js';

const TOOL_SHORT: Record<string, string> = {
  read_file: 'Reading', write_file: 'Writing', edit_file: 'Editing',
  edit_file_all: 'Editing', apply_patch: 'Patching', delete_file: 'Deleting',
  run_command: 'Running', bash: 'Running', glob: 'Searching', grep: 'Searching',
  web_fetch: 'Fetching', web_search: 'Searching', git_commit: 'Committing',
  git_status: 'Git status', git_diff: 'Git diff', spawn_agent: 'Spawning agent',
};

interface Props {
  busy: boolean;
  taskStartedAt: number;
  streamEvents: StreamEvent[];
}

function elapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ActivitySummary({ busy, taskStartedAt, streamEvents }: Props) {
  const [dim, setDim] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const pulse = setInterval(() => setDim(d => !d), 2000);
    const clock = setInterval(() => tick(n => n + 1), 1000);
    return () => { clearInterval(pulse); clearInterval(clock); };
  }, [busy]);

  if (!busy) return null;

  // Find the last in-flight tool: tool_start whose id hasn't appeared in a tool_end
  const doneIds = new Set(streamEvents.filter(e => e.type === 'tool_end').map(e => e.toolId));
  const lastTool = [...streamEvents].reverse().find(
    e => e.type === 'tool_start' && e.tool && !doneIds.has(e.tool.id)
  );

  const hasText  = streamEvents.some(e => e.type === 'text');
  const hasTool  = streamEvents.some(e => e.type === 'tool_start');
  const toolsDone = streamEvents.filter(e => e.type === 'tool_end').length;

  let verb: string;
  let detail: string | null = null;

  if (lastTool?.tool) {
    const t = lastTool.tool!;
    verb = TOOL_SHORT[t.name] ?? t.name.replace(/_/g, ' ');
    if (t.arg) detail = t.arg.split('\n')[0]!.slice(0, 50);
  } else if (hasText) {
    verb = 'Writing';
    if (toolsDone > 0) detail = `${toolsDone} step${toolsDone !== 1 ? 's' : ''} done`;
  } else if (hasTool) {
    verb = 'Working';
    if (toolsDone > 0) detail = `${toolsDone} done`;
  } else {
    verb = 'Thinking';
  }

  return (
    <Box paddingX={2} marginBottom={1} gap={1}>
      <Text color={dim ? C.textDim : C.brand} dimColor={dim}>⊙</Text>
      <Text color={C.textSecondary}>{verb}</Text>
      {detail && <Text color={C.textDim}>{detail}</Text>}
      <Text color={C.textDim}>· {elapsed(taskStartedAt)}</Text>
    </Box>
  );
}
