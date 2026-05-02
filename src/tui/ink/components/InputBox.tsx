/**
 * Bottom-anchored prompt input.
 *
 * Uses `ink-text-input` for the editable field. Ctrl+C is handled here
 * (two presses within 1.5s exits) rather than relying on Ink's default
 * SIGINT so App can own the exit policy. Enter triggers onSubmit with
 * the trimmed value and clears the buffer.
 *
 * Extensions layered on top of the plain field (all feature-flagged and
 * callback-driven so App stays in charge):
 *   - Vim mode (Esc → NORMAL, `i` → INSERT) when `vimMode` is true.
 *   - Paste-collapse: large single-tick buffer jumps are hidden behind
 *     a placeholder until Ctrl+E expands them.
 *   - @-mention hook: emits `onAtQueryChange` whenever the token after
 *     the last `@` changes, so the parent can show AtFileComplete.
 *   - Ctrl+M and Ctrl+H bubble up via `onRequestOverlay` so App can
 *     mount the appropriate modal without InputBox knowing about them.
 *   - `?` on an empty buffer also bubbles up, mirroring the README.
 */

import * as React from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "../theme-context.js";
import {
  applyVimKey,
  createVimState,
  type VimMode,
  type VimState,
} from "./vim-bindings.js";
import {
  detectPaste,
  PasteCollapseView,
  type PasteSegment,
} from "./PasteCollapse.js";

export interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  busy: boolean;
  placeholder?: string;
  vimMode?: boolean;
  /** Parent wants to know when the @-token changes (null = none active). */
  onAtQueryChange?: (query: string | null) => void;
  /** Parent wants to know when the leading `/<token>` changes (null = none active). */
  onSlashQueryChange?: (query: string | null) => void;
  /** Parent wants to know when to surface a modal overlay. */
  onRequestOverlay?: (kind: "models" | "help") => void;
  /** Parent owns the focus so it can be stolen when an overlay is up. */
  inputFocus?: boolean;
  /** Parent wants to toggle YOLO mode (Ctrl+Y). */
  onRequestYoloToggle?: () => void;
}

const CTRL_C_TIMEOUT_MS = 1500;

function lastAtToken(value: string): string | null {
  // The last `@` must be at column 0 or preceded by whitespace to count.
  const idx = value.lastIndexOf("@");
  if (idx === -1) return null;
  if (idx > 0) {
    const prev = value[idx - 1];
    if (prev !== " " && prev !== "\t" && prev !== "\n") return null;
  }
  const tail = value.slice(idx + 1);
  if (/\s/.test(tail)) return null;
  return tail;
}

function leadingSlashToken(value: string): string | null {
  // Buffer must start with `/` and the first token must contain no whitespace.
  // Returns the substring after `/` up to the first whitespace (or EOL).
  if (!value.startsWith("/")) return null;
  const tail = value.slice(1);
  const ws = tail.search(/\s/);
  return ws === -1 ? tail : tail.slice(0, ws);
}

export function InputBox(props: InputBoxProps): React.JSX.Element {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const palette = useTheme();
  const cols = stdout?.columns ?? 80;
  const [ctrlCArmed, setCtrlCArmed] = React.useState(false);
  const armTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const [vimState, setVimState] = React.useState<VimState>(() =>
    createVimState(),
  );
  const [pasteSegment, setPasteSegment] = React.useState<PasteSegment | null>(
    null,
  );
  const [pasteExpanded, setPasteExpanded] = React.useState(false);
  const prevValueRef = React.useRef<string>(props.value);

  const focus = props.inputFocus ?? !props.busy;
  const vimActive = props.vimMode === true && vimState.mode === "NORMAL";

  React.useEffect(() => {
    return (): void => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

  // Notify parent whenever the active @-token shifts.
  React.useEffect(() => {
    if (props.onAtQueryChange) {
      props.onAtQueryChange(lastAtToken(props.value));
    }
  }, [props.value, props.onAtQueryChange]);

  // Notify parent whenever the leading `/<token>` shifts. We only emit
  // a non-null query when the buffer is *just* the slash command being
  // typed (no first-token whitespace yet) — once the user adds an
  // argument, the dropdown auto-dismisses.
  React.useEffect(() => {
    if (props.onSlashQueryChange) {
      const token = leadingSlashToken(props.value);
      // Only suggest while the buffer is JUST the command name, i.e.
      // there is no whitespace anywhere in the value yet. After the
      // user types a space the suggestion is in the way.
      const active = token !== null && !/\s/.test(props.value);
      props.onSlashQueryChange(active ? token : null);
    }
  }, [props.value, props.onSlashQueryChange]);

  // Invalidate paste-collapse if the buffer shrinks past the pasted region.
  React.useEffect(() => {
    if (pasteSegment === null) return;
    if (props.value.length < pasteSegment.end) {
      setPasteSegment(null);
      setPasteExpanded(false);
    }
  }, [props.value, pasteSegment]);

  // Wrap onChange so we can detect paste bursts, strip raw DEL/BS chars,
  // and strip pending `@` updates.
  const handleChange = React.useCallback(
    (next: string): void => {
      const prev = prevValueRef.current;
      // Strip raw DEL (0x7f) and BS (0x08) characters that slip through when
      // Ink doesn't recognise the terminal's backspace keycode. Without this,
      // terminals that send ^? or ^H for Backspace get literal `` / `` in
      // the buffer instead of a deletion.
      const DEL = "\x7f";
      const BS = "\x08";
      let sanitized = next;
      if (next.includes(DEL) || next.includes(BS)) {
        sanitized = next.replace(new RegExp(`[${DEL}${BS}]`, "g"), "");
        // Emulate backspace: the raw char replaced the character before the
        // cursor. Since we can't know the exact cursor position from here,
        // we do the common case: strip one raw char and remove the character
        // immediately before each occurrence.
        let result = prev;
        for (const ch of next) {
          if (ch === "\x7f" || ch === "\x08") {
            // Delete the last character (if any) for each backspace.
            if (result.length > 0) result = result.slice(0, -1);
          } else {
            result += ch;
          }
        }
        sanitized = result;
      }
      prevValueRef.current = sanitized;
      const seg = detectPaste(prev, sanitized);
      if (seg !== null) {
        setPasteSegment(seg);
        setPasteExpanded(false);
      }
      props.onChange(sanitized);
    },
    [props.onChange],
  );

  useInput(
    (inputCh, key) => {
      // Ctrl+C handling — highest priority.
      //   1. If the buffer has text → clear it (don't arm exit).
      //   2. If the buffer is empty → arm exit; second press within 1.5s exits.
      // This matches the muscle memory most shells / Claude Code use.
      if (key.ctrl && inputCh === "c") {
        if (props.value.length > 0) {
          props.onChange("");
          setCtrlCArmed(false);
          if (armTimerRef.current) {
            clearTimeout(armTimerRef.current);
            armTimerRef.current = null;
          }
          return;
        }
        if (ctrlCArmed) {
          exit();
          return;
        }
        setCtrlCArmed(true);
        if (armTimerRef.current) clearTimeout(armTimerRef.current);
        armTimerRef.current = setTimeout(
          () => setCtrlCArmed(false),
          CTRL_C_TIMEOUT_MS,
        );
        return;
      }

      // Ctrl+Y — toggle YOLO mode at any time.
      if (key.ctrl && inputCh === "y") {
        if (props.onRequestYoloToggle) props.onRequestYoloToggle();
        return;
      }

      // Overlay hotkeys bubble up to App.
      if (props.onRequestOverlay) {
        if (key.ctrl && inputCh === "m") {
          props.onRequestOverlay("models");
          return;
        }
        if (key.ctrl && inputCh === "h") {
          props.onRequestOverlay("help");
          return;
        }
        if (inputCh === "?" && props.value === "" && !key.ctrl && !key.meta) {
          props.onRequestOverlay("help");
          return;
        }
      }

      // Paste-collapse toggle.
      if (key.ctrl && inputCh === "e" && pasteSegment !== null) {
        setPasteExpanded((v) => !v);
        return;
      }

      // Vim mode transitions + NORMAL key handling.
      if (props.vimMode === true) {
        if (key.escape) {
          setVimState((s) => ({ ...s, mode: "NORMAL", pending: "" }));
          return;
        }
        if (vimState.mode === "NORMAL" && !key.ctrl && !key.meta) {
          if (key.return) {
            // In NORMAL mode, Enter still submits.
            props.onSubmit(props.value);
            return;
          }
          const r = applyVimKey(props.value, vimState, inputCh);
          if (r.exitRequested === true) {
            exit();
            return;
          }
          if (r.handled) {
            if (r.value !== props.value) props.onChange(r.value);
            setVimState(r.state);
            return;
          }
        }
      }
    },
    { isActive: focus },
  );

  const borderColour = props.busy ? palette.brand : palette.accent;
  const promptColour = props.busy ? palette.brand : palette.accent;
  const collapsed = pasteSegment !== null && !pasteExpanded;

  return (
    <Box flexDirection="column" width={cols}>
      <Box borderStyle="single" borderColor={borderColour} paddingX={1}>
        <Box gap={1} flexGrow={1}>
          <Text color={promptColour}>❯</Text>
          {collapsed && pasteSegment !== null ? (
            <PasteCollapseView
              value={props.value}
              segment={pasteSegment}
              expanded={false}
            />
          ) : (
            <TextInput
              value={props.value}
              onChange={handleChange}
              onSubmit={props.onSubmit}
              placeholder={props.placeholder ?? "Ask dirgha anything…"}
              showCursor={!props.busy && !vimActive}
              focus={focus && !vimActive}
            />
          )}
        </Box>
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          {props.vimMode === true && (
            <Text color={vimActive ? palette.accent : palette.brand} bold>
              [{vimModeLabel(vimState.mode)}]
            </Text>
          )}
          {pasteSegment !== null && pasteExpanded && (
            <Text color={palette.textMuted} dimColor>
              pasted block expanded (Ctrl+E collapse)
            </Text>
          )}
          {props.busy && <BusyHint palette={palette} />}
        </Box>
        {ctrlCArmed && (
          <Text color={palette.accent} bold>
            Press Ctrl+C again to exit.
          </Text>
        )}
      </Box>
    </Box>
  );
}

function vimModeLabel(m: VimMode): string {
  return m === "NORMAL" ? "NORMAL" : "INSERT";
}

/**
 * Busy-state hint with a live elapsed-second counter, matching
 * gemini-cli's `(esc to cancel, 12s)` pattern. The timer ticks every
 * 1s while busy; cleans up on unmount.
 */
function BusyHint({
  palette,
}: {
  palette: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return (): void => clearInterval(t);
  }, []);
  const label =
    elapsed < 60
      ? `${elapsed}s`
      : elapsed < 3600
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  return (
    <Text color={palette.textMuted}>esc cancel · {label} · ctrl+c clear</Text>
  );
}
