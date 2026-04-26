/**
 * Logo: single-item banner shown once at startup.
 *
 * Rendered inside <Static> by App so it never re-renders and never
 * participates in scroll-jitter. Width-adaptive: wide ASCII block on
 * terminals >= 60 cols, compact one-liner otherwise.
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';

export interface LogoProps {
  version: string;
}

const WIDE_ROWS: readonly string[] = [
  '  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ',
  '  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗',
  '  ██║  ██║██║██████╔╝██║  ███╗███████║███████║',
  '  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║',
  '  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║',
  '  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
];

export function Logo({ version }: LogoProps): React.JSX.Element {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  // Logo uses only the 4 palette colours so every theme tints it
  // distinctly — gradient effect is dropped, pick beats per-row noise.
  const ROW_COLOURS: readonly string[] = [
    palette.logoB, palette.logoA, palette.brand, palette.accent, palette.brand, palette.borderActive,
  ];
  const BORDER = palette.borderActive;
  const TAG = palette.accent;
  if (cols < 60) {
    return (
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text color={BORDER}>
          <Text color={ROW_COLOURS[0]}>◆ </Text>
          <Text color={ROW_COLOURS[1]}>DIRGHA</Text>
          <Text color={BORDER}> ◆</Text>
        </Text>
        <Text color={TAG}>
          ✦ Dirgha Code{' '}
          <Text color={ROW_COLOURS[2]}>v{version}</Text>
          {' '}✦
        </Text>
        <Text color={ROW_COLOURS[3]}>dirgha.ai · /help</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
      <Text color={BORDER}>{'    ╭──────────────────────────────────────────────────────────╮'}</Text>
      {WIDE_ROWS.map((row, i) => {
        const colour = ROW_COLOURS[i] ?? ROW_COLOURS[0];
        return (
          <Text key={i} color={BORDER}>
            {'    │'}
            <Text color={colour}>{row}</Text>
            {'│'}
          </Text>
        );
      })}
      <Text color={BORDER}>{'    ╰──────────────────────────────────────────────────────────╯'}</Text>
      <Text color={TAG}>
        {'    ✦ '}
        <Text color={ROW_COLOURS[1]}>Dirgha Code</Text>
        <Text color={ROW_COLOURS[2]}> · </Text>
        <Text color={ROW_COLOURS[3]}>dirgha.ai</Text>
        {' ✦'}
        <Text color={ROW_COLOURS[5]}>{`        v${version}  /help`}</Text>
      </Text>
    </Box>
  );
}
