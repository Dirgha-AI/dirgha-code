/** tui/components/InputBox.tsx — OpenCode-style two-row input box.
 *
 * Input is read through Ink's built-in `useInput` primitive. We used to run a
 * hand-rolled raw stdin handler here to work around ink-text-input's React 19
 * incompatibility, but that path drifted through several bugs — partial ESC
 * sequences leaking into the buffer, focus-flip race conditions, setRawMode
 * fighting with pickers, and ultimately the "prompt disappearing" symptom the
 * user kept reporting. `useInput` is bundled with Ink core (distinct from the
 * broken ink-text-input package), manages raw mode via Ink's own refcount so
 * pickers work correctly, and delivers pastes as a single multi-char callback
 * so we don't fight with bracketed-paste markers ourselves.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import { C } from '../colors.js';
import { modelLabel, provLabel } from '../helpers.js';
import {
  prevPos, nextPos, wordLeft, wordRight,
  deleteGraphemeBefore, deleteGraphemeAt,
} from '../helpers/grapheme.js';

/**
 * Read keyboard input via Ink's built-in `useInput` primitive. All the raw
 * stdin / bracketed paste / UTF-8 decoding / partial ANSI escape handling we
 * used to do by hand is now Ink's job — Ink coordinates setRawMode with any
 * sibling `useInput` (pickers, menus) via its own refcount, and delivers
 * pastes as a single multi-char `input` string, so we don't have to track
 * paste state machines ourselves.
 *
 * Paste detection is delta-based: if a single callback dumps 40+ chars we
 * collapse it as "[pasted N lines]" in the display, but the raw text goes
 * into the input buffer exactly as typed.
 */
interface CursorOp {
  kind:
    | 'insert'
    | 'backspace' | 'delete-forward'
    | 'left' | 'right' | 'home' | 'end'
    | 'word-left' | 'word-right'
    | 'submit' | 'noop';
  text?: string;
}

/** Pure reducer — apply a key event to (value, cursor) state. */
function applyOp(value: string, cursor: number, op: CursorOp): { value: string; cursor: number } {
  switch (op.kind) {
    case 'insert': {
      const ins = op.text ?? '';
      if (!ins) return { value, cursor };
      return { value: value.slice(0, cursor) + ins + value.slice(cursor), cursor: cursor + ins.length };
    }
    case 'backspace': {
      const [v, c] = deleteGraphemeBefore(value, cursor);
      return { value: v, cursor: c };
    }
    case 'delete-forward': {
      const [v, c] = deleteGraphemeAt(value, cursor);
      return { value: v, cursor: c };
    }
    case 'left':       return { value, cursor: prevPos(value, cursor) };
    case 'right':      return { value, cursor: nextPos(value, cursor) };
    case 'home':       return { value, cursor: 0 };
    case 'end':        return { value, cursor: value.length };
    case 'word-left':  return { value, cursor: wordLeft(value, cursor) };
    case 'word-right': return { value, cursor: wordRight(value, cursor) };
    default:           return { value, cursor };
  }
}

function useTextInput({
  onOp,
  onSubmit,
  focus,
}: {
  onOp: (op: CursorOp) => void;
  onSubmit: () => void;
  focus: boolean;
}) {
  useInput((input, key) => {
    if (key.return) { onSubmit(); return; }
    if (key.escape) return;
    if (key.pageUp || key.pageDown) return;
    if (key.tab) return;

    // Cursor navigation (Gap 3: grapheme-aware movement, word jump).
    // Meta = Alt on most terminals, e.g. Option+← on macOS.
    if (key.leftArrow)  { onOp({ kind: key.meta || key.ctrl ? 'word-left'  : 'left'  }); return; }
    if (key.rightArrow) { onOp({ kind: key.meta || key.ctrl ? 'word-right' : 'right' }); return; }
    if (key.upArrow || key.downArrow) return; // reserved for history

    // Ink 6.8 quirk: the terminal's Backspace key sends \x7f, which parseKeypress
    // labels as key.delete. key.backspace is only true for the legacy \b (\x08)
    // sent by Ctrl+H and a handful of terminals. Since users overwhelmingly press
    // Backspace, route BOTH to delete-before-cursor. Forward-delete is unreachable
    // from a normal keyboard — if we ever want it, Ctrl+D is the escape hatch.
    if (key.delete || key.backspace) { onOp({ kind: 'backspace' }); return; }

    // Ctrl chords: A=home, E=end, U=clear-to-start, K=clear-to-end. Others ignored.
    if (key.ctrl) {
      if (input === 'a') { onOp({ kind: 'home' }); return; }
      if (input === 'e') { onOp({ kind: 'end' }); return; }
      // Ctrl+C / Ctrl+D / others → parent handles, don't insert.
      return;
    }

    if (!input) return;
    const cleaned = input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    if (cleaned) onOp({ kind: 'insert', text: cleaned });
  }, { isActive: focus });
}

interface Props {
  value: string;
  onChange: (v: string | ((prev: string) => string)) => void;
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

const PASTE_LINE_THRESHOLD = 10;
const PASTE_CHAR_THRESHOLD = 1000;
const PASTE_DELTA_THRESHOLD = 80; // chars in one keystroke event = likely paste
const TYPING_DEBOUNCE_MS = 150;

// A paste is rendered inline as [pasted N lines · M chars] where it was inserted,
// preserving the typed text before and after. Full value goes to the LLM.
interface PasteRange { start: number; length: number; lines: number; }

export function InputBox({
  value, onChange, onSubmit,
  busy, plan, model, provider,
  focus, submitKey, placeholder, costUsd,
  isEditingPaste: externalEditingPaste,
  onToggleEditPaste,
}: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const [internalEditingPaste, setInternalEditingPaste] = useState(false);
  const fullContentRef = useRef<string>('');
  const cursorRef = useRef<number>(0);  // cursor index into value
  const [cursorPos, setCursorPos] = useState(0);
  const pasteRangesRef = useRef<PasteRange[]>([]);
  const [pasteRanges, setPasteRanges] = useState<PasteRange[]>([]);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Cursor blink effect. (We used to also listen for XTerm focus events
  // ESC[?1004h to pause the blink on blur, but Ink's useInput didn't strip
  // those ESC[I/ESC[O bytes from stdin, so they leaked into the input
  // buffer as literal garbage like `[O[I[O[I`. Removed the feature; a
  // blink that keeps going while the terminal is blurred is strictly
  // better than character corruption.)
  useEffect(() => {
    if (!focus) return;
    const interval = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(interval);
  }, [focus]);

  const isEditingPaste = externalEditingPaste ?? internalEditingPaste;
  const setIsEditingPaste = (v: boolean) => {
    if (externalEditingPaste === undefined) setInternalEditingPaste(v);
    else if (onToggleEditPaste) onToggleEditPaste();
  };

  const borderColor = busy ? C.borderIdle : plan ? C.borderAccent : C.borderActive;
  const promptColor = busy ? C.textDim : plan ? C.accent : C.brand;
  const modeLabel = plan ? 'plan' : 'build';
  const modeColor = plan ? C.accent : C.brand;
  const mLabel = modelLabel(model);
  const pLabel = provLabel(provider);

  const lineCount = value.split('\n').length;
  const charCount = value.length;

  // Feed reducer ops to the input state. Refs stay in sync synchronously
  // (hermes-agent lesson) so a fast type+submit doesn't lose the last char.
  useTextInput({
    onOp: (op) => {
      const prevValue = fullContentRef.current ?? value;
      const prevCursor = cursorRef.current;
      const next = applyOp(prevValue, prevCursor, op);
      // Sync refs FIRST, before scheduling React updates.
      fullContentRef.current = next.value;
      cursorRef.current = next.cursor;
      // Paste bookkeeping — inserts of ≥80 chars in one op get collapsed.
      if (op.kind === 'insert' && op.text && op.text.length >= PASTE_DELTA_THRESHOLD) {
        const lines = op.text.split('\n').length;
        pasteRangesRef.current = [...pasteRangesRef.current, { start: prevCursor, length: op.text.length, lines }];
        setPasteRanges([...pasteRangesRef.current]);
      } else if ((op.kind === 'backspace' || op.kind === 'delete-forward') && pasteRangesRef.current.length > 0) {
        const newLen = next.value.length;
        const kept = pasteRangesRef.current.filter(r => r.start + r.length <= newLen);
        if (kept.length !== pasteRangesRef.current.length) {
          pasteRangesRef.current = kept;
          setPasteRanges([...kept]);
        }
      }
      onChange(next.value);
      setCursorPos(next.cursor);
    },
    onSubmit: () => {
      const content = fullContentRef.current || value;
      if (!content) return;
      fullContentRef.current = '';
      cursorRef.current = 0;
      pasteRangesRef.current = [];
      setPasteRanges([]);
      setCursorPos(0);
      setIsEditingPaste(false);
      onChange('');
      onSubmit(content);
    },
    focus,
  });

  // Keep refs in sync when the parent sets value externally (history pick,
  // autocomplete replace, picker dismissal). Move cursor to end-of-value
  // since the parent just rewrote the whole thing.
  useEffect(() => {
    fullContentRef.current = value;
    if (cursorRef.current > value.length) {
      cursorRef.current = value.length;
      setCursorPos(value.length);
    }
  }, [value]);

  // Build the inline display: [typed prefix][paste placeholder][typed suffix][...][cursor]
  // Keeps the user's typed text visible with paste collapses inline.
  const displaySegments: Array<{ text: string; kind: 'typed' | 'paste' }> = [];
  if (pasteRanges.length === 0) {
    displaySegments.push({ text: value, kind: 'typed' });
  } else {
    const sorted = [...pasteRanges].sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const r of sorted) {
      if (r.start > cursor) displaySegments.push({ text: value.slice(cursor, r.start), kind: 'typed' });
      displaySegments.push({ text: `[pasted ${r.lines} line${r.lines === 1 ? '' : 's'}]`, kind: 'paste' });
      cursor = r.start + r.length;
    }
    if (cursor < value.length) displaySegments.push({ text: value.slice(cursor), kind: 'typed' });
  }
  const totalTypedLen = displaySegments.filter(s => s.kind === 'typed').reduce((n, s) => n + s.text.length, 0);
  const hasPastes = pasteRanges.length > 0;
  const isEmpty = value.length === 0;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} width={cols}>
      {/* Row 1: prompt + segmented input — shows typed text + inlined paste placeholders */}
      <Box gap={1}>
        <Text color={promptColor}>{plan ? 'plan ❯' : '❯'}</Text>
        {isEmpty && placeholder ? (
          // Show placeholder whenever input is empty — even while focused and
          // the agent is busy. This is how users learn mid-work injection
          // works: the placeholder changes to "type to inject into this turn".
          <>
            <Text color={C.textDim}>{placeholder}</Text>
            {focus && <Text color={C.textPrimary}>{cursorVisible ? '█' : ' '}</Text>}
          </>
        ) : (
          // Render value with cursor inline at cursorPos. KEY FIX: use Ink's
          // `inverse` prop to highlight the grapheme under the cursor — NOT
          // raw ANSI `\x1b[7m` escape bytes. Ink renders Text children as
          // literal text and doesn't interpret embedded ANSI, so the old
          // code was printing the raw escape sequence on screen instead of
          // inverting the background. That's why cursor movement + typing
          // looked broken: every keystroke re-rendered with broken escapes
          // that mangled the whole line.
          (() => {
            const cur = Math.min(cursorPos, value.length);
            if (pasteRanges.length === 0) {
              // Split the value into left-of-cursor, under-cursor, and
              // right-of-cursor. Each renders as its own Text node.
              const left = value.slice(0, cur);
              const under = value.slice(cur, cur + 1);
              const right = value.slice(cur + 1);
              return (
                <Text>
                  {left ? <Text color={C.textPrimary}>{left}</Text> : null}
                  {focus && under && (cursorVisible
                    ? <Text color={C.textPrimary} inverse>{under}</Text>
                    : <Text color={C.textPrimary}>{under}</Text>)}
                  {focus && !under && <Text color={C.textPrimary}>{cursorVisible ? '█' : ' '}</Text>}
                  {!focus && under ? <Text color={C.textPrimary}>{under}</Text> : null}
                  {right ? <Text color={C.textPrimary}>{right}</Text> : null}
                </Text>
              );
            }
            // Paste-ranges path — segmented display with cursor at end.
            // Multi-cursor + paste ranges simultaneously is niche; punt on
            // it and render the trailing block cursor like before.
            return (
              <Text>
                {displaySegments.map((seg, idx) => (
                  <Text key={idx} color={seg.kind === 'paste' ? C.accent : C.textPrimary}>{seg.text}</Text>
                ))}
                {focus && <Text color={C.textPrimary}>{cursorVisible ? '█' : ' '}</Text>}
              </Text>
            );
          })()
        )}
      </Box>

      {/* Paste hint row — only when there's a paste in the buffer */}
      {hasPastes && (
        <Box gap={1} paddingY={0}>
          <Text color={C.textDim} dimColor>
            {pasteRanges.length} paste{pasteRanges.length > 1 ? 's' : ''} · type more, Enter to send · Ctrl+K to clear
          </Text>
        </Box>
      )}

      {/* Row 2: just the mode + busy hint. Model/provider/cost already live
          in the StatusBar one line below — showing them twice looked cluttered. */}
      <Box gap={2} paddingLeft={2}>
        <Text color={modeColor} bold>{modeLabel}</Text>
        {busy && <Text color={C.textDim} dimColor>running… · type to inject · Esc to cancel</Text>}
      </Box>
    </Box>
  );
}
