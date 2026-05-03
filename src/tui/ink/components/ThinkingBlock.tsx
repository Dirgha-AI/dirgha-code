/**
 * Thinking block — Gemini CLI-style always-visible reasoning display.
 *
 * Thinking content is shown as a clean bubble: first line is a bold
 * summary heading, the remainder is in a left-bordered italic block.
 * Always visible — no toggle/collapse. During streaming the heading
 * updates live; after streaming the block stays visible for context.
 *
 * ThinkingBlockGroup merges 3+ consecutive blocks into single grouped rows.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";

export interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

function splitContent(content: string): { summary: string; body: string } {
  const lines = content.trim().split("\n");
  if (lines.length <= 1) return { summary: "", body: content.trim() };
  return {
    summary: lines[0].trim(),
    body: lines.slice(1).join("\n").trim(),
  };
}

export const ThinkingBlock = React.memo(function ThinkingBlock({
  content,
}: ThinkingBlockProps): React.JSX.Element | null {
  const palette = useTheme();
  if (!content) return null;

  const { summary, body } = splitContent(content);

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      {summary.length > 0 && (
        <Box paddingLeft={2} marginBottom={body.length > 0 ? 0 : 0}>
          <Text color={palette.text.primary} bold italic>
            {summary}
          </Text>
        </Box>
      )}
      {body.length > 0 && (
        <Box
          borderStyle="single"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderColor={palette.border.default}
          paddingLeft={1}
          marginLeft={2}
        >
          <Text color={palette.text.secondary} italic wrap="wrap">
            {body}
          </Text>
        </Box>
      )}
      {summary.length === 0 && body.length === 0 && (
        <Text color={palette.text.secondary} italic>
          {content}
        </Text>
      )}
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
  if (blocks.length === 0) return null;

  // One block with content — delegate to ThinkingBlock.
  if (blocks.length === 1) {
    return <ThinkingBlock content={blocks[0].content} />;
  }

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      {blocks.map((block, i) => {
        const { summary, body } = splitContent(block.content);
        return (
          <Box key={block.id} flexDirection="column">
            {summary.length > 0 && (
              <Box paddingLeft={2} marginBottom={body.length > 0 ? 0 : 0}>
                <Text color={palette.text.primary} bold italic>
                  {summary}
                </Text>
              </Box>
            )}
            {body.length > 0 && (
              <Box
                borderStyle="single"
                borderLeft
                borderRight={false}
                borderTop={false}
                borderBottom={false}
                borderColor={
                  palette.colors.border ?? palette.border.default ?? "#444"
                }
                paddingLeft={1}
                marginLeft={2}
                marginBottom={i < blocks.length - 1 ? 1 : 0}
              >
                <Text color={palette.text.secondary} italic wrap="wrap">
                  {body}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
});
