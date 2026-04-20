import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { C } from '../../colors.js';

const TOOL_MAP: Record<string, string> = {
  read_file: 'Read', write_file: 'Write', edit_file: 'Edit',
  edit_file_all: 'Edit', apply_patch: 'Patch', make_dir: 'Mkdir',
  delete_file: 'Delete', run_command: 'Run', bash: 'Bash',
  search_files: 'Search', list_files: 'List', glob: 'Glob',
  repo_map: 'Map', git_status: 'GitStatus', git_diff: 'GitDiff',
  git_log: 'GitLog', git_commit: 'Commit', web_fetch: 'Fetch',
  web_search: 'Search', qmd_search: 'Docs',
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function prettyLabel(name: string, label?: string): string {
  if (label?.startsWith('Agent')) return label;
  return TOOL_MAP[name] || name.replace(/_/g, ' ');
}

/** Elapsed-time formatter. Sub-60s: "5s". Minutes: "1m 12s". */
function formatElapsed(startedAt?: number): string {
  if (!startedAt) return '';
  const ms = Date.now() - startedAt;
  if (ms < 1000) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function ToolItem({ tool, isDone, result, isError }: any) {
  const label = prettyLabel(tool.name, tool.label);
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState('');

  // Spinner animation for in-flight tools
  useEffect(() => {
    if (isDone || isError) return;
    const tick = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER.length);
      setElapsed(formatElapsed(tool.startedAt));
    }, 80);
    return () => clearInterval(tick);
  }, [isDone, isError, tool.startedAt]);

  const icon = isError ? '✗' : isDone ? '·' : SPINNER[frame];
  const iconColor = isError ? C.error : isDone ? C.textDim : C.accent;

  return (
    <Box gap={1}>
      <Text color={iconColor}>{icon}</Text>
      <Text color={isDone ? C.textDim : C.textSecondary}>{label}</Text>
      {tool.arg && <Text color={C.textMuted}>({tool.arg.slice(0, 50)})</Text>}
      {!isDone && elapsed && <Text color={C.textDim}>{elapsed}</Text>}
      {isDone && result && <Text color={C.textDim}>— {result.slice(0, 40)}</Text>}
    </Box>
  );
}
