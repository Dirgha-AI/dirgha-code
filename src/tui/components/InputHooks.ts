/** tui/components/InputHooks.ts — Input handling hooks for text input */
import * as React from 'react';
import { useStdin } from 'ink';
import { StringDecoder } from 'string_decoder';

/** Check if string ends mid-ANSI escape sequence (e.g., "\x1b[") */
export function endsMidEscape(s: string): boolean {
  const lastChar = s.charCodeAt(s.length - 1);
  if (lastChar === 0x1b) return true; // ESC alone
  if (lastChar === 0x5b && s.includes('\x1b')) return true; // ESC[
  // Partial CSI: ESC[ + digits/semicolons but no final letter
  if (/\x1b\[$/.test(s) || /\x1b\[[0-9;]*$/.test(s)) return true;
  return false;
}

/**
 * Paste-burst detector.
 *
 * When a terminal doesn't emit bracketed-paste escapes (\x1b[200~ … \x1b[201~)
 * — e.g. Windows conhost, some tmux configs — a paste arrives as rapid
 * individual keystrokes including \r/\n that would otherwise be treated as
 * "submit". We coalesce keystrokes that arrive within BURST_GAP_MS into a
 * single paste buffer, and defer submit until the stream is quiet.
 */
const BURST_GAP_MS = 8;        // chars arriving <8ms apart = paste burst
const BURST_MIN_LEN = 3;        // paste if ≥3 chars accumulate within the gap

/** Text input hook with proper UTF-8, ANSI escape, and paste-burst handling. */
export function useTextInput({
  value,
  onChange,
  onSubmit,
  focus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  focus: boolean;
}) {
  const { stdin, setRawMode } = useStdin();
  const escBufferRef = React.useRef<string>('');
  const decoderRef = React.useRef(new StringDecoder('utf8'));
  const burstBufRef = React.useRef<string>('');
  const burstLastTsRef = React.useRef<number>(0);
  const burstTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  React.useEffect(() => {
    if (!focus || !stdin) return;
    setRawMode?.(true);

    /** Flush accumulated burst buffer as a single paste. */
    const flushBurst = () => {
      if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
      const buf = burstBufRef.current;
      burstBufRef.current = '';
      if (!buf) return;
      // Strip trailing \r/\n of a single-keystroke submit; keep embedded ones as pasted text.
      const trailingSubmit = /\r?\n$/.test(buf) && buf.length === 1;
      if (trailingSubmit) {
        onSubmit(valueRef.current);
        return;
      }
      onChange(valueRef.current + buf);
    };

    const handler = (data: Buffer) => {
      const rawChunk = decoderRef.current.write(data);
      let str = escBufferRef.current + rawChunk;

      if (endsMidEscape(str)) {
        const lastEscIdx = str.lastIndexOf('\x1b');
        escBufferRef.current = str.slice(lastEscIdx);
        str = str.slice(0, lastEscIdx);
        if (!str) return;
      } else {
        escBufferRef.current = '';
      }

      // Drop raw control sequences that have no text meaning.
      if (str === '\x03') return; // Ctrl+C (upstream handler deals)
      if (str === '\x1b') return; // ESC alone
      if (str.startsWith('\x1b[')) return; // Arrow/ANSI CSI

      // Handle backspace eagerly (never part of a paste)
      if (str === '\x7f' || str === '\b') {
        // Flush any pending burst first so backspace is relative to committed state
        flushBurst();
        onChange(valueRef.current.slice(0, -1));
        return;
      }

      const now = Date.now();
      const gap = now - burstLastTsRef.current;
      burstLastTsRef.current = now;

      // Big chunk in one read = obvious paste (already not character-by-character)
      if (str.length > 1) {
        // Cancel pending burst timer and merge this chunk
        if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
        burstBufRef.current += str;
        // Commit immediately — we know this is a paste
        const buf = burstBufRef.current;
        burstBufRef.current = '';
        onChange(valueRef.current + buf);
        return;
      }

      // Single-char read
      const isNewline = str === '\r' || str === '\n';

      // If this arrives inside a burst, keep accumulating (even newlines are text)
      if (gap < BURST_GAP_MS) {
        burstBufRef.current += str;
        if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
        burstTimerRef.current = setTimeout(flushBurst, BURST_GAP_MS * 3);
        return;
      }

      // First char after a quiet period
      if (burstBufRef.current.length >= BURST_MIN_LEN) {
        // Previous burst is still pending — flush it
        flushBurst();
      }

      if (isNewline) {
        // Solo Enter with no burst ahead — submit
        if (burstBufRef.current) flushBurst();
        onSubmit(valueRef.current);
        return;
      }

      // Start a new potential burst; if more chars follow quickly it grows,
      // otherwise the timer flushes it as a single char.
      burstBufRef.current += str;
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
      burstTimerRef.current = setTimeout(flushBurst, BURST_GAP_MS * 3);
    };

    stdin.on('data', handler);
    return () => {
      stdin.off('data', handler);
      escBufferRef.current = '';
      burstBufRef.current = '';
      if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
      setRawMode?.(false);
    };
  }, [stdin, focus, onChange, onSubmit, setRawMode]);

  return { value };
}