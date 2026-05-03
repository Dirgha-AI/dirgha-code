/**
 * Thinking block: collapsible render of reasoning tokens.
 *
 * Collapsed by default to a one-line summary (`∇ thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Press Enter
 * or Space to toggle. Auto-expands during active streaming and
 * auto-collapses when the thinking span ends.
 *
 * ThinkingBlockGroup wraps 3+ consecutive thinking blocks in a single
 * collapsible accordion row.
 */

import * as React from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme-context.js";
import { TRANSCRIPT_GLYPHS } from "../icons.js";

export interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export const ThinkingBlock = React.memo(function ThinkingBlock({
  content,
  isStreaming = false,
}: ThinkingBlockProps): React.JSX.Element | null {
  const palette = useTheme();
  const [collapsed, setCollapsed] = React.useState(true);

  React.useEffect(() => {
    if (isStreaming) {
      setCollapsed(false);
    } else {
      setCollapsed(true);
    }
  }, [isStreaming]);

  useInput(
    (input, key) => {
      if ((key.return || input === " ") && !isStreaming) {
        setCollapsed((prev) => !prev);
      }
    },
    { isActive: true },
  );

  if (content.length === 0 && !isStreaming) return null;

  if (collapsed) {
    return (
      <Box gap={1} marginBottom={1}>
        <Text color={palette.text.secondary} dimColor>
          {TRANSCRIPT_GLYPHS.thinking}
        </Text>
        <Text color={palette.text.secondary} dimColor italic>
          thinking…
          {content.length > 0
            ? ` (${content.length} chars — Enter/Space to expand)`
            : ""}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Box width={2}>
        <Text color={palette.text.secondary} dimColor>
          {TRANSCRIPT_GLYPHS.thinking}
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <Text color={palette.text.secondary} dimColor italic wrap="wrap">
          {content || "thinking…"}
        </Text>
      </Box>
    </Box>
  );
});

export interface ThinkingBlockGroupProps {
  blocks: { id: string; content: string }[];
}

export const ThinkingBlockGroup = React.memo(function ThinkingBlockGroup({
  blocks,
}: ThinkingBlockGroupProps): React.JSX.Element | null {
  const palette = useTheme();
  const [collapsed, setCollapsed] = React.useState(true);

  useInput(
    (input, key) => {
      if (key.return || input === " ") {
        setCollapsed((prev) => !prev);
      }
    },
    { isActive: true },
  );

  const totalChars = blocks.reduce((sum, b) => sum + b.content.length, 0);

  if (collapsed) {
    return (
      <Box gap={1} marginBottom={1}>
        <Text color={palette.text.secondary} dimColor>
          {TRANSCRIPT_GLYPHS.thinking}
        </Text>
        <Text color={palette.text.secondary} dimColor italic>
          thinking ({blocks.length} blocks, {totalChars} chars — Enter/Space to
          expand)
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {blocks.map((block, i) => (
        <Box
          key={block.id}
          flexDirection="row"
          marginBottom={i < blocks.length - 1 ? 0 : 0}
        >
          <Box width={2}>
            <Text color={palette.text.secondary} dimColor>
              {TRANSCRIPT_GLYPHS.thinking}
            </Text>
          </Box>
          <Box flexGrow={1} flexDirection="column">
            <Text color={palette.text.secondary} dimColor italic wrap="wrap">
              {block.content}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
});
