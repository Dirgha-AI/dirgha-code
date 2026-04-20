/**
 * tui/components/SessionPicker.tsx — Ctrl+S session browser overlay
 *
 * Shows recent sessions. Navigate with arrows, Enter to resume, Esc to cancel.
 * Mirrors opencode's session list UX.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { C } from '../colors.js';

export interface SessionEntry {
  id: string;
  title: string;
  model: string;
  tokens: number;
  updatedAt: string;
}

interface Props {
  sessions: SessionEntry[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}

export function SessionPicker({ sessions, onSelect, onCancel }: Props) {
  const [cursor, setCursor] = useState(0);

  useInput((_ch, key) => {
    if (key.escape || (_ch === 'q' && !key.ctrl)) { onCancel(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(sessions.length - 1, c + 1)); return; }
    if (key.return && sessions.length > 0) { onSelect(sessions[cursor]!.id); }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={C.brand} paddingX={1} marginTop={1}>
      <Box paddingX={1} marginBottom={1}>
        <Text color={C.brand} bold>* sessions</Text>
        <Text color={C.textDim}> ↑↓ navigate · Enter resume · Esc cancel</Text>
      </Box>
      {sessions.length === 0 && <Text color={C.textDim}>  (no saved sessions)</Text>}
      {sessions.map((s, i) => {
        const active = i === cursor;
        const tokStr = s.tokens >= 1000 ? `${(s.tokens / 1000).toFixed(0)}k` : String(s.tokens);
        const date = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
        return (
          <Box key={s.id} gap={1}>
            <Text color={active ? C.brand : C.textDim}>{active ? '>' : ' '}</Text>
            <Box flexDirection="column">
              <Text color={active ? C.textPrimary : C.textSecondary} bold={active}>
                {s.title || s.id.slice(0, 8)}
              </Text>
              <Text color={C.textDim}>
                {s.model?.split('/').pop()?.slice(0, 20) ?? s.model ?? '—'}  ·  {tokStr} tok  ·  {date}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
