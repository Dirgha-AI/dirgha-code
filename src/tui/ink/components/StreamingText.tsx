/**
 * Streaming assistant text block.
 *
 * Renders a chunk of already-accumulated text_delta content with full
 * markdown formatting (headings, lists, code fences, tables, inline
 * emphasis). The `✦` glyph in the gutter mirrors gemini-cli's
 * GeminiMessage — single-column prefix, wrap-friendly content beside.
 *
 * Use one instance per text span (a text span is a contiguous run
 * of text_delta between either thinking or tool events).
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';
import { MarkdownDisplay } from '../markdown/index.js';

export interface StreamingTextProps {
  content: string;
}

const PREFIX = '✦';
const PREFIX_WIDTH = 2;

export function StreamingText({ content }: StreamingTextProps): React.JSX.Element | null {
  const { stdout } = useStdout();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const contentWidth = Math.max(20, cols - PREFIX_WIDTH - 2);
  if (content.length === 0) return null;
  return (
    <Box flexDirection="row" marginBottom={1}>
      <Box width={PREFIX_WIDTH}>
        <Text color={palette.text.accent}>{PREFIX}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <MarkdownDisplay text={content} palette={palette} width={contentWidth} />
      </Box>
    </Box>
  );
}
