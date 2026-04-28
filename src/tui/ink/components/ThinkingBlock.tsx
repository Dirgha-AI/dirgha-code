/**
 * Thinking block: dim italic render of reasoning tokens.
 *
 * Collapsed by default to a char-count summary (`thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Pass
 * `expanded` to dump the full content instead.
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';

export interface ThinkingBlockProps {
  content: string;
  expanded?: boolean;
}

export function ThinkingBlock({ content, expanded = false }: ThinkingBlockProps): React.JSX.Element | null {
  const { stdout } = useStdout();
  const width = Math.max(20, (stdout?.columns ?? 80) - 6);
  if (content.length === 0) return null;

  if (!expanded) {
    return (
      <Box gap={1} marginBottom={1}>
        <Text color="gray" dimColor>⠋</Text>
        <Text color="gray" dimColor italic>
          thinking… ({content.length} chars)
        </Text>
      </Box>
    );
  }

  return (
    <Box gap={2} width={width} marginBottom={1}>
      <Text color="gray" dimColor>⠋</Text>
      <Text color="gray" dimColor italic wrap="wrap">{content}</Text>
    </Box>
  );
}
