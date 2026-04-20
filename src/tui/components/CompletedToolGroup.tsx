import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';

const TOOL_MAP: Record<string, string> = {
  read_file: 'Read', write_file: 'Write', edit_file: 'Edit',
  edit_file_all: 'Edit', apply_patch: 'Patch', make_dir: 'Mkdir',
  delete_file: 'Delete', run_command: 'Run', bash: 'Run',
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

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

interface ToolEntry { name: string; label?: string; arg?: string }

/** Collapse consecutive identical tool names into "Edit ×3 path/to/file" */
function collapse(tools: ToolEntry[]): Array<{ label: string; arg?: string; count: number }> {
  const out: Array<{ label: string; arg?: string; count: number }> = [];
  for (const t of tools) {
    const lbl = toolLabel(t.name, t.label);
    const last = out[out.length - 1];
    if (last && last.label === lbl && !last.arg && !t.arg) {
      last.count++;
    } else if (last && last.label === lbl && last.arg === t.arg) {
      last.count++;
    } else {
      out.push({ label: lbl, arg: t.arg, count: 1 });
    }
  }
  return out;
}

export function CompletedToolGroup({ tools }: { tools: ToolEntry[] }) {
  const MAX = 10;
  const collapsed = collapse(tools);
  const shown = collapsed.slice(0, MAX);
  const overflow = collapsed.length - shown.length;

  return (
    <Box paddingX={2} flexDirection="column" marginTop={1}>
      {shown.map((t, i) => (
        <Box key={i} gap={1}>
          <Text color={C.brand}>·</Text>
          <Text color={C.textSecondary}>
            {t.label}{t.count > 1 ? ` ×${t.count}` : ''}
          </Text>
          {t.arg && (
            <Text color={C.textDim}>{trunc(t.arg, 48)}</Text>
          )}
        </Box>
      ))}
      {overflow > 0 && (
        <Box gap={1}>
          <Text color={C.textDim}>·</Text>
          <Text color={C.textDim}>+{overflow} more</Text>
        </Box>
      )}
    </Box>
  );
}
