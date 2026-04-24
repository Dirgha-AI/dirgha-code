/**
 * Full-width modal overlay showing every available slash command plus
 * the TUI keyboard shortcuts.
 *
 * The command list is supplied as props so the caller decides whether
 * to feed it the built-in catalogue, the live `SlashRegistry.names()`
 * output, or a test-only stub. Shortcuts live here (they're TUI state,
 * not slash state).
 *
 * Navigation: type-to-filter, arrow keys or j/k to scroll, Esc / q to
 * close. Pure presentational; the parent owns visibility.
 */

import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

export interface HelpSlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  group?: string;
}

export interface HelpOverlayProps {
  slashCommands: HelpSlashCommand[];
  onClose: () => void;
}

const KEYBOARD_SHORTCUTS: ReadonlyArray<{ key: string; desc: string }> = [
  { key: 'Ctrl+C ×2', desc: 'exit' },
  { key: 'Ctrl+M',   desc: 'model picker' },
  { key: 'Ctrl+H',   desc: 'this help' },
  { key: '?',        desc: 'help (when input empty)' },
  { key: 'Tab',      desc: 'autocomplete @file' },
  { key: 'Ctrl+E',   desc: 'expand / collapse pasted block' },
  { key: 'Esc',      desc: 'close overlay · vim NORMAL mode' },
  { key: 'i',        desc: 'vim INSERT mode' },
];

function inferGroup(name: string): string {
  if (['help', 'exit', 'quit', 'clear', 'upgrade'].includes(name)) return 'navigation';
  if (['login', 'logout', 'keys', 'account', 'setup'].includes(name)) return 'auth';
  if (['session', 'resume', 'history', 'compact', 'memory'].includes(name)) return 'session';
  if (['fleet', 'mode'].includes(name)) return 'fleet';
  if (['model', 'models', 'theme', 'config', 'status', 'init'].includes(name)) return 'config';
  if (['skills', 'cost'].includes(name)) return 'tools';
  return 'other';
}

const GROUP_ORDER: ReadonlyArray<string> = [
  'navigation',
  'auth',
  'session',
  'config',
  'fleet',
  'tools',
  'other',
];

const GROUP_TITLES: Record<string, string> = {
  navigation: 'Navigation',
  auth: 'Auth & Keys',
  session: 'Session & Memory',
  config: 'Model & Config',
  fleet: 'Fleet & Modes',
  tools: 'Tools & Skills',
  other: 'Other',
};

export function HelpOverlay(props: HelpOverlayProps): React.JSX.Element {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const width = Math.min(cols - 2, 100);
  const [filter, setFilter] = React.useState('');
  const [scroll, setScroll] = React.useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') { props.onClose(); return; }
    if (key.backspace || key.delete) {
      setFilter(f => f.slice(0, -1));
      setScroll(0);
      return;
    }
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
  const filtered = props.slashCommands.filter(c =>
    q === '' || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  );

  const byGroup = new Map<string, HelpSlashCommand[]>();
  for (const c of filtered) {
    const g = c.group ?? inferGroup(c.name);
    const list = byGroup.get(g) ?? [];
    list.push(c);
    byGroup.set(g, list);
  }

  const lines: React.ReactNode[] = [];
  for (const group of GROUP_ORDER) {
    const cmds = byGroup.get(group);
    if (!cmds || cmds.length === 0) continue;
    cmds.sort((a, b) => a.name.localeCompare(b.name));
    lines.push(
      <Box key={`h-${group}`} marginTop={1}>
        <Text color="magenta" bold>{GROUP_TITLES[group] ?? group}</Text>
      </Box>,
    );
    for (const c of cmds) {
      lines.push(
        <Box key={`c-${c.name}`} gap={2}>
          <Text color="cyan">/{c.name.padEnd(14)}</Text>
          <Text color="gray">{c.description}</Text>
        </Box>,
      );
    }
  }

  // Shortcut block always visible — append after command lines.
  lines.push(
    <Box key="kb-h" marginTop={1}>
      <Text color="magenta" bold>Keyboard</Text>
    </Box>,
  );
  for (const kb of KEYBOARD_SHORTCUTS) {
    lines.push(
      <Box key={`kb-${kb.key}`} gap={2}>
        <Text color="yellow">{kb.key.padEnd(14)}</Text>
        <Text color="gray">{kb.desc}</Text>
      </Box>,
    );
  }

  const maxVisible = Math.max(5, rows - 10);
  const visible = lines.slice(scroll, scroll + maxVisible);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      width={width}
    >
      <Box gap={1} justifyContent="space-between">
        <Box gap={1}>
          <Text color="magenta" bold>help</Text>
          <Text color="gray" dimColor>
            {filtered.length} command{filtered.length === 1 ? '' : 's'}
            {filter !== '' ? ` · filter: "${filter}"` : ''}
          </Text>
        </Box>
        <Text color="gray" dimColor>type to filter · ↑↓ · esc</Text>
      </Box>

      {visible.length === 0
        ? <Text color="gray" dimColor>No commands match "{filter}"</Text>
        : <>{visible}</>
      }

      {lines.length > maxVisible && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {scroll + maxVisible < lines.length
              ? `↓ ${lines.length - scroll - maxVisible} more below`
              : '· end ·'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
