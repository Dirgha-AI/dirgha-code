/**
 * Thinking block: dim italic render of reasoning tokens.
 *
 * Collapsed by default to a char-count summary (`thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Press Enter
 * (Return) on a collapsed block to expand it, Enter again to collapse.
 */

import * as React from "react";
import { Box, Text, useInput, useStdout } from "ink";

export interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({
  content,
}: ThinkingBlockProps): React.JSX.Element | null {
  const { stdout } = useStdout();
  const width = Math.max(20, (stdout?.columns ?? 80) - 6);
  const [expanded, setExpanded] = React.useState(false);

  useInput((_, key) => {
    if (key.return) {
      setExpanded((prev) => !prev);
    }
  }, { isActive: true });

  if (content.length === 0) return null;

  if (!expanded) {
    return (
      <Box gap={1} marginBottom={1}>
        <Text color="white" dimColor>
          ⠋
        </Text>
        <Text color="white" dimColor italic>
          thinking… ({content.length} chars — Enter to expand)
        </Text>
      </Box>
    );
  }

  return (
    <Box gap={2} width={width} marginBottom={1}>
      <Text color="white" dimColor>
        ⠋
      </Text>
      <Text color="white" dimColor italic wrap="wrap">
        {content}
      </Text>
    </Box>
  );
}
