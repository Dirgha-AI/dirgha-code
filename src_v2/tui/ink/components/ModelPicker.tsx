/**
 * Modal overlay for picking a model.
 *
 * Presentation: a bordered, centred box with the model catalogue
 * grouped by provider. Arrow keys move the cursor, Enter selects,
 * Esc / `q` cancels. Digit keys 1-9 pick by position within the
 * visible list for muscle-memory speed.
 *
 * Shape of the overlay is deliberately small (≤200 LOC); the
 * catalogue itself is owned upstream so this file stays purely
 * presentational.
 */

import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

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
  const cols = stdout?.columns ?? 80;
  const width = Math.min(cols - 4, 72);

  const initial = Math.max(0, props.models.findIndex(m => m.id === props.current));
  const [cursor, setCursor] = React.useState(initial);

  useInput((ch, key) => {
    if (key.escape || ch === 'q') {
      props.onCancel();
      return;
    }
    if (key.upArrow || ch === 'k') {
      setCursor(c => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || ch === 'j') {
      setCursor(c => Math.min(props.models.length - 1, c + 1));
      return;
    }
    if (key.return) {
      const picked = props.models[cursor];
      if (picked) props.onPick(picked.id);
      return;
    }
    if (ch && /^[1-9]$/.test(ch)) {
      const n = Number(ch) - 1;
      if (n < props.models.length) {
        const picked = props.models[n];
        if (picked) props.onPick(picked.id);
      }
    }
  });

  const groups = groupByProvider(props.models);
  const selected = props.models[cursor];

  // Build a flat row index so digit shortcuts map to the visible ordering.
  let idx = 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color="magenta" bold>model picker</Text>
        <Text color="gray" dimColor>↑↓ enter · 1-9 · esc</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {groups.map(group => (
          <Box key={group.provider} flexDirection="column" marginBottom={1}>
            <Text color="cyan" dimColor>{group.provider}</Text>
            {group.items.map(m => {
              const myIdx = idx;
              idx += 1;
              const isCursor = myIdx === cursor;
              const isCurrent = m.id === props.current;
              const prefix = isCursor ? '>' : isCurrent ? '•' : ' ';
              const num = myIdx < 9 ? String(myIdx + 1) : ' ';
              const tierColor = m.tier ? TIER_COLOR[m.tier] : 'gray';
              return (
                <Box key={m.id} gap={1} paddingLeft={1}>
                  <Text color={isCursor ? 'magentaBright' : 'gray'}>{prefix}</Text>
                  <Text color="gray" dimColor>{num}</Text>
                  <Text
                    color={isCursor ? 'white' : isCurrent ? 'magenta' : 'gray'}
                    bold={isCursor}
                  >
                    {m.label ?? m.id}
                  </Text>
                  {m.tier !== undefined && (
                    <Text color={tierColor} dimColor={!isCursor}>{m.tier}</Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray">
        <Box gap={1}>
          <Text color="gray" dimColor>→</Text>
          <Text color="magenta">{selected?.id ?? props.current}</Text>
        </Box>
      </Box>
    </Box>
  );
}
