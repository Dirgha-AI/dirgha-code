import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';

const TOOL_MAP: Record<string, string> = {
  read_file: 'Read', write_file: 'Write', edit_file: 'Edit',
  edit_file_all: 'Edit', apply_patch: 'Patch', make_dir: 'Mkdir',
  delete_file: 'Delete', run_command: 'Run', bash: 'Bash',
  search_files: 'Search', list_files: 'List', glob: 'Glob',
  repo_map: 'Map', git_status: 'GitStatus', git_diff: 'GitDiff',
  git_log: 'GitLog', git_commit: 'Commit', checkpoint: 'Checkpoint',
  git_branch: 'Branch', git_push: 'Push', git_stash: 'Stash',
  web_fetch: 'Fetch', web_search: 'Search', qmd_search: 'Docs',
};

function toolLabel(name: string, label?: string): string {
  if (label?.startsWith('Agent')) return label;
  return TOOL_MAP[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function CompletedToolGroup({ tools }: { tools: any[] }) {
  const MAX = 8, shown = tools.slice(0, MAX), overflow = tools.length - shown.length;
  return (
    <Box paddingX={2} flexDirection="column" marginTop={1}>
      {shown.map((t, i) => (
        <Box key={i} gap={1}><Text color={C.brand}>·</Text><Text color={C.textSecondary}>{toolLabel(t.name, t.label)}</Text></Box>
      ))}
      {overflow > 0 && <Box gap={1}><Text color={C.textDim}>·</Text><Text color={C.textDim}>+{overflow} more</Text></Box>}
    </Box>
  );
}
