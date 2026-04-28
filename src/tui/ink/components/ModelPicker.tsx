/**
 * Modal overlay for picking a model — opencode-style polish.
 *
 * Presentation: a bordered, centred box with the model catalogue
 * grouped by provider. Arrow keys move the cursor; Enter selects;
 * Esc / `q` cancels. Digit keys 1-9 pick by position within the
 * filtered list. Letters typed when not in command mode build a
 * fuzzy filter; Backspace removes the last char.
 *
 * Visual cues mirror opencode's DialogModel:
 *   ● leading filled disc for the currently-selected model
 *   ▸ leading caret for the cursor row (overrides ●)
 *   right-aligned tier footer (free / basic / pro / premium / price)
 *   bottom keybind hint bar with all shortcuts
 *
 * Shape stays small (≤220 LOC); the catalogue itself is owned
 * upstream so this file is purely presentational.
 */

import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';

export interface ModelEntry {
  id: string;
  provider: string;
  tier?: 'free' | 'basic' | 'pro' | 'premium';
  label?: string;
}

export interface ModelPickerProps {
  models: ModelEntry[];
  current: string;
  onPick: (id: string) => void;
  onCancel: () => void;
}

const TIER_COLOR: Record<NonNullable<ModelEntry['tier']>, string> = {
  free: 'greenBright',
  basic: 'cyan',
  pro: 'magenta',
  premium: 'yellow',
};

function groupByProvider(models: ModelEntry[]): Array<{ provider: string; items: ModelEntry[] }> {
  const map = new Map<string, ModelEntry[]>();
  for (const m of models) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return [...map.entries()].map(([provider, items]) => ({ provider, items }));
}

export function ModelPicker(props: ModelPickerProps): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const width = Math.min(cols - 4, 80);

  const [filter, setFilter] = React.useState('');

  const filtered = React.useMemo(() => {
    if (filter.length === 0) return props.models;
    const needle = filter.toLowerCase();
    return props.models.filter(m =>
      m.id.toLowerCase().includes(needle) ||
      m.provider.toLowerCase().includes(needle) ||
      (m.label?.toLowerCase().includes(needle) ?? false),
    );
  }, [props.models, filter]);

  const initial = Math.max(0, filtered.findIndex(m => m.id === props.current));
  const [cursor, setCursor] = React.useState(initial);

  // Reset cursor when filter changes so it lands on the first match.
  React.useEffect(() => {
    setCursor(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useInput((ch, key) => {
    if (key.escape) {
      if (filter.length > 0) {
        setFilter('');
        return;
      }
      props.onCancel();
      return;
    }
    if (key.upArrow || (key.ctrl && ch === 'p')) {
      setCursor(c => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || (key.ctrl && ch === 'n')) {
      setCursor(c => Math.min(Math.max(0, filtered.length - 1), c + 1));
      return;
    }
    if (key.return) {
      const picked = filtered[cursor];
      if (picked) props.onPick(picked.id);
      return;
    }
    if (key.backspace || key.delete) {
      setFilter(f => f.slice(0, -1));
      return;
    }
    if (ch && /^[1-9]$/.test(ch) && filter.length === 0) {
      const n = Number(ch) - 1;
      if (n < filtered.length) {
        const picked = filtered[n];
        if (picked) props.onPick(picked.id);
      }
      return;
    }
    // Any printable char that wasn't a control key extends the filter.
    if (ch && !key.ctrl && !key.meta && /^[\w@\-./:]$/.test(ch)) {
      setFilter(f => f + ch);
    }
  }, { isActive: true });

  const groups = groupByProvider(filtered);
  const selected = filtered[cursor];
  const titleWidth = width - 24;

  // Build a flat row index so digit shortcuts map to the visible ordering.
  let idx = 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={palette.accent}
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color={palette.accent} bold>Select model</Text>
        {filter.length > 0 ? (
          <Text color={palette.text.accent}>
            <Text color={palette.text.secondary} dimColor>filter: </Text>
            {filter}
            <Text color={palette.text.secondary} dimColor>{' '}({filtered.length})</Text>
          </Text>
        ) : (
          <Text color={palette.text.secondary} dimColor>{filtered.length} models</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filtered.length === 0 && (
          <Text color={palette.text.secondary} dimColor>No models match "{filter}".</Text>
        )}
        {groups.map(group => (
          <Box key={group.provider} flexDirection="column" marginBottom={1}>
            <Text color={palette.text.secondary} dimColor>{group.provider}</Text>
            {group.items.map(m => {
              const myIdx = idx;
              idx += 1;
              const isCursor = myIdx === cursor;
              const isCurrent = m.id === props.current;
              const num = myIdx < 9 && filter.length === 0 ? String(myIdx + 1) : ' ';
              const tierColor = m.tier ? TIER_COLOR[m.tier] : palette.text.secondary;
              const lead = isCursor ? '▸' : isCurrent ? '●' : ' ';
              const titleColor = isCursor
                ? palette.text.primary
                : isCurrent
                  ? palette.text.accent
                  : palette.text.secondary;
              const title = m.label ?? m.id;
              const truncatedTitle = title.length > titleWidth
                ? `${title.slice(0, titleWidth - 1)}…`
                : title;
              return (
                <Box key={m.id} flexDirection="row" paddingLeft={1}>
                  <Box minWidth={2}>
                    <Text color={isCursor ? palette.text.accent : isCurrent ? palette.text.accent : palette.text.secondary}>{lead}</Text>
                  </Box>
                  <Box minWidth={2}>
                    <Text color={palette.text.secondary} dimColor>{num}</Text>
                  </Box>
                  <Box flexGrow={1}>
                    <Text color={titleColor} bold={isCursor}>{truncatedTitle}</Text>
                  </Box>
                  {m.tier !== undefined && (
                    <Box minWidth={8} justifyContent="flex-end">
                      <Text color={tierColor} dimColor={!isCursor}>{m.tier}</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={palette.border.default} flexDirection="column">
        <Box>
          <Text color={palette.text.secondary} dimColor>→ </Text>
          <Text color={palette.text.accent}>{selected?.id ?? props.current}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color={palette.text.secondary} dimColor>
            <Text bold color={palette.text.primary}>↑↓</Text> nav
            {'   '}
            <Text bold color={palette.text.primary}>enter</Text> pick
            {'   '}
            <Text bold color={palette.text.primary}>1-9</Text> jump
          </Text>
          <Text color={palette.text.secondary} dimColor>
            <Text bold color={palette.text.primary}>type</Text> filter
            {'   '}
            <Text bold color={palette.text.primary}>esc</Text> {filter ? 'clear' : 'cancel'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
