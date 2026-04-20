/** tui/components/ScrollView.tsx — Ctrl+U history viewer with accurate line calculation */
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { ChatMsg } from '../constants.js';
import { C } from '../colors.js';
import { CompletedMsg } from './CompletedMsg.js';
import { getViewportOffset } from './ScrollLogic.js';

interface Props { messages: ChatMsg[]; onClose: () => void; }

export function ScrollView({ messages, onClose }: Props) {
  const { stdout } = useStdout();
  const termHeight = (stdout?.rows ?? 24) - 4;
  const cols = stdout?.columns ?? 80;
  const [offset, setOffset] = useState(() => Math.max(0, messages.length - 1));

  // Calculate viewport using width-aware line estimation
  const { start, end } = getViewportOffset(messages, offset, cols, termHeight);
  const visible = messages.slice(start, end + 1);

  // Scrollbar math
  const total = messages.length;
  const barH = Math.max(4, Math.floor(termHeight * (termHeight / Math.max(total, termHeight))));
  const barPos = total <= 1 ? 0 : Math.floor((offset / (total - 1)) * (termHeight - barH));

  // Keyboard navigation
  useInput((_ch, key) => {
    const ch = _ch;
    if (key.escape || ch === 'q') { onClose(); return; }
    if (ch === 'j' || key.downArrow) setOffset(o => Math.min(total - 1, o + 1));
    if (ch === 'k' || key.upArrow) setOffset(o => Math.max(0, o - 1));
    if (ch === 'd' || key.pageDown) setOffset(o => Math.min(total - 1, o + Math.max(1, Math.floor(termHeight / 4))));
    if (ch === 'u' || key.pageUp) setOffset(o => Math.max(0, o - Math.max(1, Math.floor(termHeight / 4))));
    if (ch === 'g') setOffset(0);
    if (ch === 'G') setOffset(total - 1);
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false}
        borderColor={C.borderSubtle} paddingX={2} gap={2}>
        <Text color={C.brand} bold>* history</Text>
        <Text color={C.textDim}>{offset + 1}/{total} msgs</Text>
        <Text color={C.textDim}>↑↓ / j k · d u page · g G top/bot · q esc close</Text>
      </Box>
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          {visible.map(msg => <CompletedMsg key={msg.id} msg={msg} />)}
        </Box>
        <Box flexDirection="column" width={1}>
          {Array.from({ length: termHeight }).map((_, i) => {
            const inBar = i >= barPos && i < barPos + barH;
            return <Text key={i} color={inBar ? C.brand : C.borderSubtle}>{inBar ? '█' : '░'}</Text>;
          })}
        </Box>
      </Box>
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}
        borderColor={C.borderSubtle} paddingX={2}>
        <Text color={C.textDim}>{start + 1}–{end + 1} of {total} · press q or Esc to return</Text>
      </Box>
    </Box>
  );
}