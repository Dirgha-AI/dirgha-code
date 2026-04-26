/**
 * Modal overlay for picking a theme palette.
 *
 * Mirrors ModelPicker's interaction grammar so muscle memory carries
 * across both pickers: arrow keys move the cursor, Enter selects,
 * Esc / `q` cancels, digit keys 1-9 jump to a row.
 *
 * Each row renders three colour swatches drawn from that theme's
 * palette (brand · accent · borderActive) so the user can see what
 * they'll get before they pick.
 */

import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { PALETTES, type ThemeName } from '../../theme.js';
import { useTheme } from '../theme-context.js';

export interface ThemePickerProps {
  current: ThemeName;
  onPick: (id: ThemeName) => void;
  onCancel: () => void;
}

export function ThemePicker(props: ThemePickerProps): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const width = Math.min(cols - 4, 60);

  const themeNames = React.useMemo(() => Object.keys(PALETTES) as ThemeName[], []);
  const initial = Math.max(0, themeNames.indexOf(props.current));
  const [cursor, setCursor] = React.useState(initial);

  useInput((ch, key) => {
    if (key.escape || ch === 'q') { props.onCancel(); return; }
    if (key.upArrow || ch === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow || ch === 'j') { setCursor(c => Math.min(themeNames.length - 1, c + 1)); return; }
    if (key.return) {
      const picked = themeNames[cursor];
      if (picked) props.onPick(picked);
      return;
    }
    if (ch && /^[1-9]$/.test(ch)) {
      const n = Number(ch) - 1;
      const picked = themeNames[n];
      if (picked) props.onPick(picked);
    }
  }, { isActive: true });

  const selected = themeNames[cursor] ?? props.current;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={palette.accent}
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color={palette.accent} bold>theme picker</Text>
        <Text color={palette.textMuted} dimColor>↑↓ enter · 1-9 · esc</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {themeNames.map((name, i) => {
          const p = PALETTES[name];
          const isCursor = i === cursor;
          const isCurrent = name === props.current;
          const prefix = isCursor ? '>' : isCurrent ? '•' : ' ';
          const num = i < 9 ? String(i + 1) : ' ';
          return (
            <Box key={name} gap={1} paddingLeft={1}>
              <Text color={isCursor ? palette.accent : palette.textMuted}>{prefix}</Text>
              <Text color={palette.textMuted} dimColor>{num}</Text>
              <Box width={16}>
                <Text
                  color={isCursor ? palette.textPrimary : isCurrent ? palette.accent : palette.textMuted}
                  bold={isCursor}
                >
                  {name}
                </Text>
              </Box>
              <Text color={p.brand}>███</Text>
              <Text color={p.accent}>███</Text>
              <Text color={p.borderActive}>███</Text>
            </Box>
          );
        })}
      </Box>

      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={palette.borderIdle}>
        <Box gap={1}>
          <Text color={palette.textMuted} dimColor>→</Text>
          <Text color={palette.accent}>{selected}</Text>
        </Box>
      </Box>
    </Box>
  );
}
