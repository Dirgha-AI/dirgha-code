/**
 * Two-step model picker — provider card grid → model list.
 *
 * Stage 1 of the new flow (paired with ModelPicker for stage 2).
 * Shows one row per registered provider with:
 *   ●  if any model from this provider is the currently-selected one
 *   ⓘ  with a model-count badge
 *   short blurb (kimi/deepseek/qwen/...)
 *   key-status indicator (✓ key set, ⚠ key missing)
 *
 * Mirrors opencode's DialogProvider → DialogModel chain, so users
 * with 50+ models in catalogue don't drown in one giant list.
 *
 * Keys:
 *   ↑↓ / k j / ctrl+p ctrl+n  navigate
 *   1-9   jump
 *   enter pick → opens ModelPicker filtered to this provider
 *   esc   cancel
 *   /     start typing to fuzzy-filter the provider names
 */

import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';

export interface ProviderEntry {
  id: string;
  label: string;
  modelCount: number;
  /** True when the API key for this provider is configured. */
  hasKey: boolean;
  /** Short human description shown after the label. */
  blurb?: string;
  /** True when the user's current model belongs to this provider. */
  isCurrent?: boolean;
}

export interface ProviderPickerProps {
  providers: ProviderEntry[];
  onPick: (providerId: string) => void;
  onCancel: () => void;
}

export function ProviderPicker(props: ProviderPickerProps): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const width = Math.min(cols - 4, 80);

  const [filter, setFilter] = React.useState('');
  const filtered = React.useMemo(() => {
    if (!filter) return props.providers;
    const needle = filter.toLowerCase();
    return props.providers.filter(p =>
      p.id.toLowerCase().includes(needle) ||
      p.label.toLowerCase().includes(needle) ||
      (p.blurb?.toLowerCase().includes(needle) ?? false),
    );
  }, [props.providers, filter]);

  const initial = Math.max(0, filtered.findIndex(p => p.isCurrent));
  const [cursor, setCursor] = React.useState(initial);

  React.useEffect(() => {
    setCursor(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useInput((ch, key) => {
    if (key.escape) {
      if (filter) { setFilter(''); return; }
      props.onCancel();
      return;
    }
    if (key.upArrow || (key.ctrl && ch === 'p')) { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow || (key.ctrl && ch === 'n')) { setCursor(c => Math.min(Math.max(0, filtered.length - 1), c + 1)); return; }
    if (key.return) {
      const picked = filtered[cursor];
      if (picked) props.onPick(picked.id);
      return;
    }
    if (key.backspace || key.delete) { setFilter(f => f.slice(0, -1)); return; }
    if (ch && /^[1-9]$/.test(ch) && !filter) {
      const n = Number(ch) - 1;
      if (n < filtered.length) {
        const picked = filtered[n];
        if (picked) props.onPick(picked.id);
      }
      return;
    }
    if (ch && !key.ctrl && !key.meta && /^[\w@\-./:]$/.test(ch)) {
      setFilter(f => f + ch);
    }
  }, { isActive: true });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={palette.text.accent}
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color={palette.text.accent} bold>Pick a provider</Text>
        {filter ? (
          <Text color={palette.text.accent}>
            <Text color={palette.text.secondary} dimColor>filter: </Text>{filter}
            <Text color={palette.text.secondary} dimColor> ({filtered.length})</Text>
          </Text>
        ) : (
          <Text color={palette.text.secondary} dimColor>{filtered.length} providers · then pick a model</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filtered.length === 0 && (
          <Text color={palette.text.secondary} dimColor>No providers match "{filter}".</Text>
        )}
        {filtered.map((p, idx) => {
          const isCursor = idx === cursor;
          const lead = isCursor ? '▸' : p.isCurrent ? '●' : ' ';
          const num = idx < 9 && !filter ? String(idx + 1) : ' ';
          const labelColour = isCursor
            ? palette.text.primary
            : p.isCurrent
              ? palette.text.accent
              : palette.text.secondary;
          const keyBadge = p.hasKey ? '✓' : '⚠';
          const keyBadgeColour = p.hasKey ? palette.status.success : palette.status.warning;
          return (
            <Box key={p.id} flexDirection="row" paddingLeft={1}>
              <Box minWidth={2}>
                <Text color={isCursor ? palette.text.accent : p.isCurrent ? palette.text.accent : palette.text.secondary}>{lead}</Text>
              </Box>
              <Box minWidth={2}>
                <Text color={palette.text.secondary} dimColor>{num}</Text>
              </Box>
              <Box minWidth={2}>
                <Text color={keyBadgeColour}>{keyBadge}</Text>
              </Box>
              <Box minWidth={14}>
                <Text color={labelColour} bold={isCursor}>{p.label}</Text>
              </Box>
              <Box flexGrow={1}>
                <Text color={palette.text.secondary} dimColor>{p.blurb ?? ''}</Text>
              </Box>
              <Box minWidth={10} justifyContent="flex-end">
                <Text color={palette.text.secondary} dimColor>{p.modelCount} model{p.modelCount === 1 ? '' : 's'}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={palette.border.default} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={palette.text.secondary} dimColor>
            <Text bold color={palette.text.primary}>↑↓</Text> nav
            {'   '}
            <Text bold color={palette.text.primary}>enter</Text> models
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
