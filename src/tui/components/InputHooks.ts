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

/** Text input hook with proper UTF-8, ANSI escape, paste-burst, and cursor handling. */
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

  // Cursor position — always clamped to [0, value.length]
  const [cursorPos, setCursorPosState] = React.useState(() => value.length);
  const cursorPosRef = React.useRef(cursorPos);

  // Keep cursor at end when value changes externally (e.g. submit clears value)
  React.useEffect(() => {
    cursorPosRef.current = value.length;
    setCursorPosState(value.length);
  }, [value]);

  const setCursor = React.useCallback((pos: number) => {
    const clamped = Math.max(0, Math.min(pos, valueRef.current.length));
    cursorPosRef.current = clamped;
    setCursorPosState(clamped);
  }, []);

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
      const cur = cursorPosRef.current;
      const next = valueRef.current.slice(0, cur) + buf + valueRef.current.slice(cur);
      cursorPosRef.current = cur + buf.length;
      setCursorPosState(cursorPosRef.current);
      onChange(next);
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

      // Drop Ctrl+C (upstream handler deals)
      if (str === '\x03') return;
      // ESC alone — no action
      if (str === '\x1b') return;

      // ── Arrow keys and navigation ──────────────────────────────────────────
      if (str === '\x1b[D') { setCursor(cursorPosRef.current - 1); return; } // left
      if (str === '\x1b[C') { setCursor(cursorPosRef.current + 1); return; } // right
      if (str === '\x1b[H' || str === '\x1b[1~') { setCursor(0); return; }   // Home
      if (str === '\x1b[F' || str === '\x1b[4~') { setCursor(valueRef.current.length); return; } // End
      // Up/down: leave to caller (history navigation) — drop here
      if (str === '\x1b[A' || str === '\x1b[B') return;
      // Delete key — remove char at cursor
      if (str === '\x1b[3~') {
        const cur = cursorPosRef.current;
        if (cur < valueRef.current.length) {
          onChange(valueRef.current.slice(0, cur) + valueRef.current.slice(cur + 1));
        }
        return;
      }
      // Ctrl+Left / Ctrl+Right — word jump
      if (str === '\x1b[1;5D' || str === '\x1bOD') {
        let p = cursorPosRef.current - 1;
        while (p > 0 && valueRef.current[p - 1] === ' ') p--;
        while (p > 0 && valueRef.current[p - 1] !== ' ') p--;
        setCursor(p); return;
      }
      if (str === '\x1b[1;5C' || str === '\x1bOC') {
        let p = cursorPosRef.current;
        while (p < valueRef.current.length && valueRef.current[p] === ' ') p++;
        while (p < valueRef.current.length && valueRef.current[p] !== ' ') p++;
        setCursor(p); return;
      }
      // Drop remaining unhandled CSI sequences
      if (str.startsWith('\x1b[') || str.startsWith('\x1bO')) return;

      // Handle backspace at cursor position
      if (str === '\x7f' || str === '\b') {
        flushBurst();
        const cur = cursorPosRef.current;
        if (cur > 0) {
          const next = valueRef.current.slice(0, cur - 1) + valueRef.current.slice(cur);
          cursorPosRef.current = cur - 1;
          setCursorPosState(cur - 1);
          onChange(next);
        }
        return;
      }

      const now = Date.now();
      const gap = now - burstLastTsRef.current;
      burstLastTsRef.current = now;

      // Big chunk in one read = obvious paste
      if (str.length > 1) {
        if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
        burstBufRef.current += str;
        const buf = burstBufRef.current;
        burstBufRef.current = '';
        const cur = cursorPosRef.current;
        cursorPosRef.current = cur + buf.length;
        setCursorPosState(cursorPosRef.current);
        onChange(valueRef.current.slice(0, cur) + buf + valueRef.current.slice(cur));
        return;
      }

      const isNewline = str === '\r' || str === '\n';

      // Inside a burst — accumulate
      if (gap < BURST_GAP_MS) {
        burstBufRef.current += str;
        if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
        burstTimerRef.current = setTimeout(flushBurst, BURST_GAP_MS * 3);
        return;
      }

      if (burstBufRef.current.length >= BURST_MIN_LEN) {
        flushBurst();
      }

      if (isNewline) {
        if (burstBufRef.current) flushBurst();
        onSubmit(valueRef.current);
        return;
      }

      // Single char — insert at cursor
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
  }, [stdin, focus, onChange, onSubmit, setRawMode, setCursor]);

  return { value, cursorPos };
}
