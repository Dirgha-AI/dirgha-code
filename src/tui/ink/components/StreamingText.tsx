/**
 * Streaming assistant text block.
 *
 * Renders a chunk of already-accumulated text_delta content. Ink
 * handles wrapping; we only decorate with the brand glyph and
 * allocate width from the TTY. Use one instance per text span
 * (a text span is a contiguous run of text_delta between either
 * thinking or tool events).
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';

export interface StreamingTextProps {
  content: string;
}

const BRAND = '#A78BFA';

export function StreamingText({ content }: StreamingTextProps): React.JSX.Element | null {
  const { stdout } = useStdout();
  const width = Math.max(20, (stdout?.columns ?? 80) - 6);
  if (content.length === 0) return null;
  return (
    <Box gap={2} width={width} marginBottom={1}>
      <Text color={BRAND}>✦</Text>
      <Text wrap="wrap">{content}</Text>
    </Box>
  );
}
