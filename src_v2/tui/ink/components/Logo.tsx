/**
 * Logo: single-item banner shown once at startup.
 *
 * Rendered inside <Static> by App so it never re-renders and never
 * participates in scroll-jitter. Width-adaptive: wide ASCII block on
 * terminals >= 60 cols, compact one-liner otherwise.
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';

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

const ROW_COLOURS: readonly string[] = [
  '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6',
];

const BORDER = '#5B21B6';
const TAG = '#A78BFA';

export function Logo({ version }: LogoProps): React.JSX.Element {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
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
