/** tui/components/CompletedMsg.tsx */
import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import type { ChatMsg } from '../constants.js';
import { C } from '../colors.js';
import { hhmm, formatTokens, truncate, modelLabel } from '../helpers.js';
import { ErrorMsg } from './ErrorMsg.js';

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    read_file: 'Read',      write_file: 'Write',    edit_file: 'Edit',
    edit_file_all: 'Edit',  apply_patch: 'Patch',   make_dir: 'Mkdir',
    delete_file: 'Delete',  run_command: 'Run',      bash: 'Bash',
    search_files: 'Search', list_files: 'List',      glob: 'Glob',
    repo_map: 'Map',        git_status: 'GitStatus', git_diff: 'GitDiff',
    git_log: 'GitLog',      git_commit: 'Commit',    checkpoint: 'Checkpoint',
    git_branch: 'Branch',   git_push: 'Push',        git_stash: 'Stash',
    git_patch: 'GitPatch',  git_auto_message: 'AutoMsg',
    web_fetch: 'Fetch',     web_search: 'Search',    qmd_search: 'Docs',
  };
  if (map[name]) return map[name]!;
  if (name.includes('_')) {
    const first = name.split('_')[0]!;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  const prefixes: Record<string, string> = {
    search: 'Search', read: 'Read', write: 'Write', create: 'Create', delete: 'Delete',
    list: 'List', check: 'Check', build: 'Build', run: 'Run', fetch: 'Fetch',
    update: 'Update', get: 'Get', find: 'Find', analyze: 'Analyze', load: 'Load',
    make: 'Make', send: 'Send', save: 'Save', execute: 'Run', generate: 'Generate',
  };
  const lower = name.toLowerCase();
  for (const [prefix, display] of Object.entries(prefixes)) {
    if (lower.startsWith(prefix) && name.length > prefix.length) {
      const rest = name.slice(prefix.length).replace(/([A-Z])/g, ' $1').trim().toLowerCase();
      return `${display} ${rest}`;
    }
  }
  return name.replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export function CompletedMsg({ msg }: { msg: ChatMsg }) {
  // ── System ────────────────────────────────────────────────────────────────
  if (msg.role === 'system') {
    if (msg.isLogo) {
      const lines = msg.content.split('\n');
      return (
        <Box paddingX={2} flexDirection="column" marginBottom={1}>
          {lines.map((line, i) => {
            if (!line.trim() && i === 0) return null;
            return <Text key={i}>{line}</Text>;
          })}
        </Box>
      );
    }
    if (msg.isDim) return <Box paddingX={2}><Text color={C.textDim}>{msg.content}</Text></Box>;
    if (msg.content.startsWith('✗')) return <ErrorMsg message={msg.content.replace(/^✗\s*/, '')} />;
    return <Box paddingX={2}><Text color={C.textMuted}>{msg.content}</Text></Box>;
  }

  // ── Tool call (legacy single) ─────────────────────────────────────────────
  if (msg.role === 'tool') {
    return (
      <Box paddingX={2} gap={1}>
        <Text color={C.brand} dimColor>∎</Text>
        <Text color={C.textMuted}>{msg.tool}</Text>
      </Box>
    );
  }

  // ── Tool group ────────────────────────────────────────────────────────────
  if (msg.role === 'tool-group') {
    const tools = msg.tools ?? [];
    if (tools.length === 0) return null;
    const MAX = 5;
    const shown = tools.slice(0, MAX);
    const overflow = tools.length - shown.length;
    const showHeader = tools.length > 1;
    return (
      <Box flexDirection="column" paddingX={2}>
        {showHeader && (
          <Box gap={1}>
            <Text color={C.brand} dimColor>∎</Text>
            <Text color={C.textDim} dimColor>{tools.length} tools</Text>
          </Box>
        )}
        <Box flexDirection="column" paddingLeft={showHeader ? 2 : 0}>
          {shown.map((t, i) => {
            const isAgent = t.label?.startsWith('Agent');
            const display = isAgent ? t.label : toolDisplayName(t.name);
            return (
              <Box key={i} gap={1}>
                <Text color={C.textDim} dimColor>·</Text>
                <Text color={C.textDim}>{display}</Text>
              </Box>
            );
          })}
          {overflow > 0 && (
            <Box gap={1}>
              <Text color={C.textDim} dimColor>·</Text>
              <Text color={C.textDim} dimColor>+{overflow} more</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // ── User ─────────────────────────────────────────────────────────────────
  if (msg.role === 'user') {
    return (
      <Box flexDirection="column" marginTop={1} paddingX={2}>
        <Box gap={2}>
          <Text color={C.textDim}>{hhmm(msg.ts)}</Text>
          <Text color={C.textSecondary} bold>you</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color={C.textPrimary} wrap="wrap">{msg.content}</Text>
        </Box>
      </Box>
    );
  }

  // ── Assistant ─────────────────────────────────────────────────────────────
  if (msg.content.startsWith('✗') || msg.content.startsWith('⚠')) {
    return <ErrorMsg message={msg.content.replace(/^[✗⚠]\s*/, '')} />;
  }
  if (msg.content === '(no response)') {
    return <Box paddingX={2} marginTop={1}><Text color={C.textDim} dimColor>⊙ dirgha · no response</Text></Box>;
  }
  const rendered = msg.rendered ?? msg.content;
  const mLabel = msg.model ? modelLabel(msg.model) : null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box paddingX={2} gap={2}>
        <Text color={C.textDim}>{hhmm(msg.ts)}</Text>
        <Text color={C.brand} bold>⊙ dirgha</Text>
        {mLabel && <Text color={C.textDim}>{mLabel}</Text>}
        {msg.tokens != null && msg.tokens > 0 && (
          <Text color={C.textDim}>
            {msg.tokens >= 1000 ? `${(msg.tokens / 1000).toFixed(1)}k` : msg.tokens} tok
          </Text>
        )}
      </Box>
      
      {msg.thinking && (
        <Box
          paddingLeft={2}
          marginLeft={1}
          flexDirection="column"
          borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false}
          borderColor={C.borderAssist}
        >
          <Text color={C.textDim}>∇ thinking</Text>
          <Text color={C.textMuted} wrap="wrap">{msg.thinking}</Text>
        </Box>
      )}

      <Box
        paddingLeft={2} marginLeft={1}
        borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false}
        borderColor={C.borderAssist}
      >
        <Text color={C.textPrimary} wrap="wrap">{rendered}</Text>
      </Box>
    </Box>
  );
}
