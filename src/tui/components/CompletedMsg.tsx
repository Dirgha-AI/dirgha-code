import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { ChatMsg } from '../constants.js';
import { C } from '../colors.js';
import { hhmm, formatTokens, modelLabel } from '../helpers.js';
import { ErrorMsg } from './ErrorMsg.js';
import { CompletedToolGroup } from './CompletedToolGroup.js';
import { CompletedSystemMsg } from './CompletedSystemMsg.js';

export function CompletedMsg({ msg }: { msg: ChatMsg }) {
  const { stdout } = useStdout();
  // Reserve 6 cols for indent + gutter (❯/✦ + gaps) so ink's wrap doesn't miscalculate
  const textWidth = (stdout?.columns ?? 80) - 6;

  if (msg.role === 'system') return <CompletedSystemMsg msg={msg} />;
  if (msg.role === 'tool') return <Box paddingX={2} gap={2}><Text color={C.brand}>✓</Text><Text color={C.textDim}>{msg.tool}</Text></Box>;
  if (msg.role === 'tool-group') return <CompletedToolGroup tools={msg.tools ?? []} />;
  if (msg.role === 'user') {
    const content = msg.content ?? '';
    const lineCount = content.split('\n').length;
    const isLargePaste = lineCount > 10 || content.length > 800;
    // Collapse large pastes: first line preview + line count
    if (isLargePaste) {
      const firstLineFull = content.split('\n', 1)[0] ?? '';
      const firstLine = firstLineFull.slice(0, 80);
      return (
        <Box paddingX={2} gap={2} marginTop={2} width={textWidth + 4} flexDirection="column">
          <Box gap={2}>
            <Text color={C.textDim}>❯</Text>
            <Text color={C.textPrimary}>{firstLine}{firstLine.length < firstLineFull.length ? '…' : ''}</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text color={C.textMuted} italic>[paste: {lineCount} lines]</Text>
          </Box>
        </Box>
      );
    }
    return (
      <Box paddingX={2} gap={2} marginTop={2} width={textWidth + 4}>
        <Text color={C.textDim}>❯</Text>
        <Box flexGrow={1}><Text color={C.textPrimary} wrap="wrap">{content}</Text></Box>
      </Box>
    );
  }

  if (msg.content.startsWith('✗') || msg.content.startsWith('⚠')) return <ErrorMsg message={msg.content.replace(/^[✗⚠]\s*/, '')} />;
  if (msg.content === '(no response)') return <Box paddingX={2}><Text color={C.textDim} dimColor>no response</Text></Box>;

  const rendered = msg.rendered ?? msg.content;
  const mLabel = msg.model ? modelLabel(msg.model) : null;
  const tokStr = msg.tokens != null && msg.tokens > 0 ? formatTokens(msg.tokens) : null;
  const th = msg.thinking?.length ?? 0;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {th > 0 && <Box paddingX={2} gap={2}><Text color={C.textDim}>▶</Text><Text color={C.textDim}>{`Thinking  ${th >= 1000 ? (th/1000).toFixed(1)+'k' : th} chars`}</Text></Box>}
      <Box paddingX={2} gap={2} width={textWidth + 4}>
        <Text color={C.brand}>✦</Text>
        <Box flexGrow={1}><Text color={C.textPrimary} wrap="wrap">{rendered}</Text></Box>
      </Box>
      <Box paddingLeft={5} gap={2}><Text color={C.textDim}>{hhmm(msg.ts)}</Text>{mLabel && <Text color={C.textDim}>{mLabel}</Text>}{tokStr && <Text color={C.textDim}>{tokStr}</Text>}</Box>
    </Box>
  );
}
