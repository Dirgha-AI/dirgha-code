// @ts-nocheck
/**
 * tui/components/ScrollView.tsx — Ctrl+U history viewer
 *
 * Triggered from App when user presses Ctrl+U (or Page Up).
 * Renders a viewport slice of all messages with j/k / arrow scroll.
 * Esc / q to close back to normal input.
 *
 * Design goals:
 *  - Viewport culling: only render messages that fit in terminal height
 *  - Scrollbar indicator on right edge
 *  - Vim j/k + arrow keys
 *  - Shows full message content (reuses CompletedMsg rendering logic)
 */
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { ChatMsg } from '../constants.js';
import { C } from '../colors.js';
import { CompletedMsg } from './CompletedMsg.js';

interface Props {
  messages: ChatMsg[];
  onClose: () => void;
}

/** Rough lines estimate for a message (for viewport sizing heuristic) */
function estimateLines(msg: ChatMsg): number {
  if (msg.role === 'tool') return 1;
  if (msg.isLogo) return 2;
  const content = msg.rendered ?? msg.content ?? '';
  const contentLines = content.split('\n').length + 1;
  // header + content, clamped to reasonable range
  return Math.max(2, Math.min(contentLines, 40));
}

export function ScrollView({ messages, onClose }: Props) {
  const { stdout } = useStdout();
  const termHeight = (stdout?.rows ?? 24) - 6; // reserve for header + footer + padding

  // offset is the index of the FIRST message in the viewport
  const [offset, setOffset] = useState(() => Math.max(0, messages.length - 1));

  // Determine how many messages fit starting from offset
  const getViewport = useCallback((): { start: number; end: number } => {
    let lines = 0;
    let end = offset;
    for (let i = offset; i < messages.length; i++) {
      const est = estimateLines(messages[i]!);
      if (lines + est > termHeight && i > offset) break;
      lines += est;
      end = i;
    }
    return { start: offset, end };
  }, [offset, messages, termHeight]);

  // Adjust offset so that the "cursor" (the message at offset) is always valid
  useEffect(() => {
    if (offset >= messages.length) setOffset(Math.max(0, messages.length - 1));
  }, [messages.length, offset]);

  const { start, end } = getViewport();
  const visible = messages.slice(start, end + 1);

  // Scrollbar math
  const total = messages.length;
  const barHeight = Math.max(2, Math.floor(termHeight * (Math.min(termHeight, total) / total)));
  const barPos = total <= 1 ? 0 : Math.floor((offset / (total - 1)) * (termHeight - barHeight));

  useInput((_ch, key) => {
    const ch = _ch;
    if (key.escape || ch === 'q') { onClose(); return; }
    
    // Scroll down
    if (ch === 'j' || key.downArrow) {
      setOffset(o => Math.min(messages.length - 1, o + 1));
      return;
    }
    // Scroll up
    if (ch === 'k' || key.upArrow) {
      setOffset(o => Math.max(0, o - 1));
      return;
    }
    // Page down
    if (ch === 'd' || key.pageDown) {
      setOffset(o => Math.min(messages.length - 1, o + 5));
      return;
    }
    // Page up
    if (ch === 'u' || key.pageUp) {
      setOffset(o => Math.max(0, o - 5));
      return;
    }
    if (ch === 'g') { setOffset(0); return; }
    if (ch === 'G') { setOffset(messages.length - 1); return; }
  });

  return (
    <Box flexDirection="column" height={termHeight + 4}>
      {/* Header */}
      <Box
        borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false}
        borderColor={C.borderSubtle}
        paddingX={2}
        gap={2}
      >
        <Text color={C.brand} bold>◆ history</Text>
        <Text color={C.textDim}>{offset + 1}/{total} msgs</Text>
        <Text color={C.textDim}>j/k ↑↓ · d/u pg · g/G top/bot · q/esc close</Text>
      </Box>

      {/* Message viewport + scrollbar */}
      <Box flexDirection="row" flexGrow={1} paddingX={1}>
        <Box flexDirection="column" flexGrow={1}>
          {visible.map(msg => (
            <CompletedMsg key={msg.id} msg={msg} />
          ))}
        </Box>

        {/* Improved efficient scrollbar */}
        <Box flexDirection="column" width={1} marginLeft={1}>
          <Box height={barPos} />
          <Box height={barHeight} backgroundColor={C.brand}>
            <Text color={C.brand}>┃</Text>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box
        borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}
        borderColor={C.borderSubtle}
        paddingX={2}
      >
        <Text color={C.textDim}>
          Viewing {start + 1}–{end + 1} of {total}
        </Text>
      </Box>
    </Box>
  );
}
