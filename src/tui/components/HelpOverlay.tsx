/**
 * tui/components/HelpOverlay.tsx — Modal overlay for /help.
 *
 * Replaces console.log help with a proper scrollable, groupable overlay.
 * Esc/q to close. Commands are grouped by category.
 */
import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { C } from '../colors.js';
import { SLASH_COMMAND_SPEC } from '../commands.js';

interface Props {
  onClose: () => void;
}

const GROUP_TITLES: Record<string, string> = {
  session:       'Session',
  auth:          'Auth & Config',
  workflow:      'Dev Workflow',
  git:           'Git',
  memory:        'Memory & Knowledge',
  safety:        'Safety',
  tools:         'Skills & Tools',
  system:        'System',
  integrations:  'Integrations',
  sprint:        'Sprint Engine',
  parallel:      'Multi-Agent',
};

export function HelpOverlay({ onClose }: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const [filter, setFilter] = useState('');
  const [scroll, setScroll] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') { onClose(); return; }
    if (key.backspace || key.delete) { setFilter(f => f.slice(0, -1)); setScroll(0); return; }
    if (key.downArrow || input === 'j') { setScroll(s => s + 1); return; }
    if (key.upArrow   || input === 'k') { setScroll(s => Math.max(0, s - 1)); return; }
    if (key.pageDown) { setScroll(s => s + 10); return; }
    if (key.pageUp)   { setScroll(s => Math.max(0, s - 10)); return; }
    if (!key.ctrl && !key.meta && input && input.length === 1 && input >= ' ') {
      setFilter(f => f + input);
      setScroll(0);
    }
  });

  const q = filter.trim().toLowerCase();
  const filtered = SLASH_COMMAND_SPEC.filter(c =>
    !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  );

  const byGroup = new Map<string, typeof SLASH_COMMAND_SPEC>();
  for (const cmd of filtered) {
    const g = cmd.group;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(cmd);
  }

  // Flatten group lines for scrolling
  const lines: React.ReactNode[] = [];
  for (const [group, cmds] of byGroup) {
    lines.push(
      <Box key={`h-${group}`} marginTop={1}>
        <Text color={C.brand} bold>{GROUP_TITLES[group] ?? group}</Text>
      </Box>
    );
    for (const c of cmds) {
      lines.push(
        <Box key={c.name} gap={2}>
          <Text color={C.accent}>{c.name.padEnd(18)}</Text>
          <Text color={C.textSecondary}>{c.description}</Text>
        </Box>
      );
    }
  }

  const maxVisible = Math.max(5, rows - 10);
  const visible = lines.slice(scroll, scroll + maxVisible);
  const totalCommands = filtered.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={C.brand}
      paddingX={1}
      width={Math.min(cols - 2, 100)}
    >
      <Box gap={1}>
        <Text color={C.brand} bold>help</Text>
        <Text color={C.textDim}>
          {totalCommands} command{totalCommands !== 1 ? 's' : ''}
          {filter ? ` · filter: "${filter}"` : ''}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={C.textDim}>
          type to filter · ↑↓ scroll · q or Esc to close
        </Text>
      </Box>

      {visible.length === 0
        ? <Text color={C.textDim}>No commands match "{filter}"</Text>
        : <>{visible}</>
      }

      {lines.length > maxVisible && (
        <Box marginTop={1}>
          <Text color={C.textDim}>
            {scroll + maxVisible < lines.length
              ? `↓ ${lines.length - scroll - maxVisible} more below`
              : 'end'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
