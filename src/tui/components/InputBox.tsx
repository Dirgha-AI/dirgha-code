/** tui/components/InputBox.tsx — OpenCode-style two-row input box */
import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../colors.js';
import { useTextInput } from './InputHooks.js';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  busy: boolean;
  plan: boolean;
  model: string;
  provider: string;
  focus: boolean;
  submitKey: number;
  placeholder?: string;
  costUsd?: number;
  isEditingPaste?: boolean;
  onToggleEditPaste?: () => void;
}

// model/provider/costUsd kept in Props for caller compatibility but no longer rendered here

const PASTE_LINE_THRESHOLD = 10;
const PASTE_CHAR_THRESHOLD = 1000;

export function InputBox({
  value, onChange, onSubmit,
  busy, plan, model, provider,
  focus, submitKey, placeholder, costUsd,
  isEditingPaste: externalEditingPaste,
}: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const [internalEditingPaste, setInternalEditingPaste] = useState(false);
  const isEditingPaste = externalEditingPaste ?? internalEditingPaste;

  // Use the input hook with proper UTF-8/ANSI and cursor handling
  const { cursorPos } = useTextInput({ value, onChange, onSubmit, focus });

  const borderColor = busy ? C.accent : focus ? C.brand : C.borderSubtle;
  const promptColor = plan ? C.brand : C.accent;

  // Paste detection — based on the largest contiguous block, not total, so
  // short text typed AFTER a paste doesn't hide the collapse indicator.
  const lines = value.split('\n');
  const lineCount = lines.length;
  const charCount = value.length;
  const showPaste = lineCount > PASTE_LINE_THRESHOLD || charCount > PASTE_CHAR_THRESHOLD;

  // When paste detected: split the value into [pasted-block | suffix-typing].
  // Pasted-block = lines up to the last "large block boundary"; suffix is
  // whatever the user typed after the paste. We approximate: keep the first
  // long line(s) collapsed, show the trailing short text + cursor so typing
  // continues to appear inline.
  let collapsedPrefix: string | null = null;
  let visibleTail = value;
  if (showPaste) {
    // Heuristic: find the last newline; anything before it is the "paste",
    // anything after is the suffix the user is typing. If no newline, keep
    // last 80 chars as the typing surface.
    const lastNl = value.lastIndexOf('\n');
    if (lastNl >= 0) {
      collapsedPrefix = value.slice(0, lastNl);
      visibleTail = value.slice(lastNl + 1);
    } else {
      collapsedPrefix = value.slice(0, -80);
      visibleTail = value.slice(-80);
    }
  }

  // Render block cursor at cursorPos position
  function withCursor(text: string, pos: number): string {
    const clamped = Math.min(pos, text.length);
    return text.slice(0, clamped) + '█' + text.slice(clamped);
  }

  const display = showPaste
    ? (focus ? withCursor(visibleTail, cursorPos - (value.length - visibleTail.length)) : visibleTail)
    : (focus ? withCursor(value, cursorPos) : value || placeholder);

  const collapsedLineCount = collapsedPrefix ? collapsedPrefix.split('\n').length : 0;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} width={cols}>
      {showPaste && collapsedPrefix && !isEditingPaste && (
        <Box gap={2}>
          <Text color={C.textDim}>❯</Text>
          <Text color={C.textMuted} italic>[paste: {collapsedLineCount} lines]</Text>
        </Box>
      )}
      <Box gap={1}>
        <Text color={promptColor}>{showPaste && collapsedPrefix ? ' ' : (plan ? 'plan ❯' : '❯')}</Text>
        <Text color={value ? C.textPrimary : C.textDim}>{display}</Text>
      </Box>
      {isEditingPaste && (
        <Box gap={2}>
          <Text color={C.brand}>✦</Text>
          <Text color={C.textSecondary}>editing in $EDITOR…</Text>
          <Text color={C.textDim}>save and quit to return</Text>
        </Box>
      )}
      {!isEditingPaste && showPaste && (
        <Box gap={2}>
          <Text color={C.textDim}>Enter to send · Ctrl+K clear · Ctrl+E open in $EDITOR</Text>
        </Box>
      )}
    </Box>
  );
}