import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../../colors.js';

const TOOL_MAP: Record<string, string> = {
  read_file: 'Read', write_file: 'Write', edit_file: 'Edit',
  edit_file_all: 'Edit', apply_patch: 'Patch', make_dir: 'Mkdir',
  delete_file: 'Delete', run_command: 'Run', bash: 'Run',
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

function formatElapsed(startedAt?: number): string {
  if (!startedAt) return '';
  const ms = Date.now() - startedAt;
  if (ms < 1000) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function trunc(s: string, max: number): string {
  // Take first line only, then truncate
  const line = s.split('\n')[0] ?? s;
  return line.length > max ? line.slice(0, max) + '…' : line;
}

export function ToolItem({ tool, isDone, result, isError }: any) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const label = prettyLabel(tool.name, tool.label);
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState('');

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

  // Budget remaining cols for result after icon + label + arg
  const labelLen = label.length;
  const argLen = tool.arg ? Math.min(tool.arg.length, 50) + 2 : 0; // "(arg)"
  const resultBudget = Math.max(20, cols - 4 - 1 - labelLen - argLen - 4);

  return (
    <Box gap={1} width={cols - 4}>
      <Text color={iconColor}>{icon}</Text>
      <Text color={isDone ? C.textDim : C.textSecondary}>{label}</Text>
      {tool.arg && <Text color={C.textMuted}>({trunc(tool.arg, 50)})</Text>}
      {!isDone && elapsed && <Text color={C.textDim}>{elapsed}</Text>}
      {isDone && result && (
        <Text color={C.textDim} wrap="truncate">— {trunc(result, resultBudget)}</Text>
      )}
    </Box>
  );
}
