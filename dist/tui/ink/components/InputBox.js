import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "../theme-context.js";
import { applyVimKey, createVimState, } from "./vim-bindings.js";
import { detectPaste, PasteCollapseView, } from "./PasteCollapse.js";
const CTRL_C_TIMEOUT_MS = 1500;
function lastAtToken(value) {
    // The last `@` must be at column 0 or preceded by whitespace to count.
    const idx = value.lastIndexOf("@");
    if (idx === -1)
        return null;
    if (idx > 0) {
        const prev = value[idx - 1];
        if (prev !== " " && prev !== "\t" && prev !== "\n")
            return null;
    }
    const tail = value.slice(idx + 1);
    if (/\s/.test(tail))
        return null;
    return tail;
}
function leadingSlashToken(value) {
    // Buffer must start with `/` and the first token must contain no whitespace.
    // Returns the substring after `/` up to the first whitespace (or EOL).
    if (!value.startsWith("/"))
        return null;
    const tail = value.slice(1);
    const ws = tail.search(/\s/);
    return ws === -1 ? tail : tail.slice(0, ws);
}
export function InputBox(props) {
    const { exit } = useApp();
    const palette = useTheme();
    const [ctrlCArmed, setCtrlCArmed] = React.useState(false);
    const armTimerRef = React.useRef(null);
    const [vimState, setVimState] = React.useState(() => createVimState());
    const [pasteSegment, setPasteSegment] = React.useState(null);
    const [pasteExpanded, setPasteExpanded] = React.useState(false);
    const prevValueRef = React.useRef(props.value);
    // Prompt history recall: up arrow pulls the most recent submitted prompt
    // for editing (replaces current input). Down arrow on a recalled prompt
    // restores the previous input. Does NOT cycle through all history.
    const [historyIdx, setHistoryIdx] = React.useState(null);
    const savedInputRef = React.useRef("");
    const history = props.promptHistory ?? [];
    // Incremented whenever value is set externally (history recall, dequeue).
    // Passed as `key` to TextInput so it remounts and cursor resets to end.
    const [textInputKey, setTextInputKey] = React.useState(0);
    const focus = props.inputFocus ?? !props.busy;
    const vimActive = props.vimMode === true && vimState.mode === "NORMAL";
    React.useEffect(() => {
        return () => {
            if (armTimerRef.current)
                clearTimeout(armTimerRef.current);
        };
    }, []);
    // When focus transitions from false to true (e.g., after a turn ends),
    // bump textInputKey so ink-text-input remounts with cursor at the end.
    // Without this the internal cursorOffset can be stale from the previous
    // input session, causing the first keystroke to land at the wrong position.
    const prevFocusRef = React.useRef(focus);
    React.useEffect(() => {
        if (focus && !prevFocusRef.current) {
            setTextInputKey((k) => k + 1);
        }
        prevFocusRef.current = focus;
    }, [focus]);
    // Detect external value changes (programmatic setInput from the parent —
    // slash autocomplete pick, queue dequeue, clear after submit, Ctrl+C
    // clear). handleChange updates prevValueRef to the typed value before
    // the next render; if prevValueRef doesn't match props.value at effect
    // time, the change came from outside InputBox and ink-text-input's
    // internal cursorOffset is stale (it stays at the previous cursor
    // position even when value changed underneath). Bump textInputKey to
    // remount the TextInput so cursor lands at the end of the new value.
    React.useEffect(() => {
        if (props.value !== prevValueRef.current) {
            setTextInputKey((k) => k + 1);
            prevValueRef.current = props.value;
        }
    }, [props.value]);
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
    // Paste-in-progress guard: slow terminals may chunk a single paste into
    // multiple keystroke ticks. The first chunk hits the char/line threshold
    // and is correctly treated as a paste. Subsequent chunks may be small
    // and fall below the threshold, causing DEL/BS stripping to corrupt the
    // pasted content. We keep a 100ms window after any paste-sized delta
    // where DEL/BS stripping is also suppressed.
    const pasteGuardRef = React.useRef(0);
    const PASTE_GUARD_MS = 100;
    // Invalidate paste-collapse if the buffer shrinks past the pasted region
    // OR grows significantly beyond it (user typing after paste). When the
    // segment boundaries become stale, collapse state is cleared so the
    // rendered text always matches the actual buffer.
    // Also clears segment when the user edits INSIDE the pasted block by
    // comparing the expected segment content against the actual buffer.
    React.useEffect(() => {
        if (pasteSegment === null)
            return;
        const valueLen = props.value.length;
        if (valueLen < pasteSegment.end || valueLen > pasteSegment.end + 500) {
            setPasteSegment(null);
            setPasteExpanded(false);
            // Bump key so TextInput remounts with cursor at end of value.
            // The paste collapse hid TextInput; when it reappears the internal
            // cursorOffset must match the actual buffer length.
            setTextInputKey((k) => k + 1);
            return;
        }
        // Check if the segment region still matches what was pasted.
        // If the user inserted/deleted mid-block, boundaries are stale.
        const segContent = props.value.slice(pasteSegment.start, pasteSegment.end);
        if (segContent.length !== pasteSegment.chars) {
            setPasteSegment(null);
            setPasteExpanded(false);
            // Same cursor-resync as above — TextInput reappears after collapse
            // and must have cursor at the correct position.
            setTextInputKey((k) => k + 1);
        }
    }, [props.value, pasteSegment]);
    // Wrap onChange so we can detect paste bursts, strip raw DEL/BS chars,
    // and strip pending `@` updates.
    const handleChange = React.useCallback((next) => {
        const prev = prevValueRef.current;
        const deltaChars = next.length - prev.length;
        // Detect paste BEFORE running the DEL/BS sanitizer. When the delta
        // looks like a paste (>=200 added chars or >=4 lines), skip the
        // DEL/BS stripper — those bytes are likely part of the pasted
        // content, not terminal backspace artifacts.
        const PASTE_CHAR_THRESHOLD = 200;
        const PASTE_LINE_THRESHOLD = 4;
        const isPasteDelta = deltaChars >= PASTE_CHAR_THRESHOLD ||
            (deltaChars > 0 &&
                (next.split("\n").length - prev.split("\n").length) >=
                    PASTE_LINE_THRESHOLD);
        // Arm the paste guard: for 100ms after any paste-sized delta,
        // keep suppressing DEL/BS stripping so multi-tick pastes from
        // slow terminals aren't corrupted.
        if (isPasteDelta) {
            pasteGuardRef.current = Date.now() + PASTE_GUARD_MS;
        }
        const isGuardActive = Date.now() < pasteGuardRef.current;
        // Strip raw DEL (0x7f) and BS (0x08) characters from terminal
        // backspace that Ink doesn't recognise. Skipped for paste-sized
        // deltas and while the paste guard is active.
        const DEL = "\x7f";
        const BS = "\x08";
        let sanitized = next;
        if (!isPasteDelta && !isGuardActive && (next.includes(DEL) || next.includes(BS))) {
            let result = "";
            for (const ch of next) {
                if (ch === DEL || ch === BS) {
                    if (result.length > 0)
                        result = result.slice(0, -1);
                }
                else {
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
    }, [props.onChange]);
    // Always-active: Ctrl+Y must work even while agent is busy.
    // Also handles up-arrow dequeue-for-edit while busy — that key event can
    // never arrive in the focus-gated useInput below because focus=!busy.
    useInput((_ch, key) => {
        if (key.ctrl && _ch === "y") {
            if (props.onRequestYoloToggle)
                props.onRequestYoloToggle();
            return;
        }
        // Up arrow on empty input while busy: pull last queued message back for
        // editing. Must live here (isActive: true) because the focus-gated handler
        // below is inactive whenever busy=true.
        if (key.upArrow &&
            props.busy &&
            props.value === "" &&
            (props.queueLength ?? 0) > 0) {
            if (props.onDequeueForEdit) {
                props.onDequeueForEdit();
                setTextInputKey((k) => k + 1);
            }
        }
    }, { isActive: true });
    useInput((inputCh, key) => {
        // Up-arrow pulls the last submitted prompt for editing (single recall,
        // not a cycle). A second up-arrow pushes deeper — matches the common
        // "I want to re-send what I just typed" flow. Down arrow restores the
        // prior input. While busy the always-active handler (above) dequeues
        // from the prompt queue instead.
        if (key.upArrow && history.length > 0) {
            if (historyIdx === null) {
                // First pull: save current input, recall most recent only.
                savedInputRef.current = props.value;
                setHistoryIdx(0);
                prevValueRef.current = history[0];
                props.onChange(history[0]);
                setPasteSegment(null);
                setPasteExpanded(false);
                setTextInputKey((k) => k + 1);
            }
            // Second+ pulls are intentionally no-ops — we only recall the
            // single most recent prompt to avoid disorienting deep scrolls.
            return;
        }
        if (key.downArrow && historyIdx !== null) {
            // Restore the saved input and reset.
            setHistoryIdx(null);
            prevValueRef.current = savedInputRef.current;
            props.onChange(savedInputRef.current);
            setPasteSegment(null);
            setPasteExpanded(false);
            setTextInputKey((k) => k + 1);
            return;
        }
        // Any other input resets history navigation.
        // inputCh may be empty for some key events (e.g. modifier-only);
        // reset based on the key object rather than requiring a character.
        if (historyIdx !== null && !key.upArrow && !key.downArrow) {
            setHistoryIdx(null);
        }
        // Paste-collapsed mode special keys.
        if (pasteSegment !== null && !pasteExpanded) {
            if (key.return) {
                // Enter submits the full value (paste included).
                props.onSubmit(props.value);
                return;
            }
            if (key.backspace || key.delete) {
                // One backspace wipes the entire pasted block.
                const newValue = props.value.slice(0, pasteSegment.start) +
                    props.value.slice(pasteSegment.end);
                setPasteSegment(null);
                setPasteExpanded(false);
                props.onChange(newValue);
                setTextInputKey((k) => k + 1);
                return;
            }
            // Any printable character: append after pasted block and resume
            // normal editing (clear collapse so TextInput remounts).
            if (inputCh && inputCh.length >= 1 && !key.ctrl && !key.meta) {
                const newValue = props.value + inputCh;
                setPasteSegment(null);
                setPasteExpanded(false);
                props.onChange(newValue);
                setTextInputKey((k) => k + 1);
                return;
            }
        }
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
            if (armTimerRef.current)
                clearTimeout(armTimerRef.current);
            armTimerRef.current = setTimeout(() => setCtrlCArmed(false), CTRL_C_TIMEOUT_MS);
            return;
        }
        // Ctrl+U — trigger self-upgrade.
        if (key.ctrl && inputCh === "u") {
            if (props.onRequestUpgrade)
                props.onRequestUpgrade();
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
        // Paste-collapse toggle — bump key so ink-text-input remounts with
        // cursor at value.length (internal cursorOffset can drift otherwise).
        if (key.ctrl && inputCh === "e" && pasteSegment !== null) {
            setPasteExpanded((v) => !v);
            setTextInputKey((k) => k + 1);
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
                    if (r.value !== props.value)
                        props.onChange(r.value);
                    setVimState(r.state);
                    // Bump key on NORMAL→INSERT so ink-text-input remounts with
                    // cursor at value.length (internal cursorOffset can be stale).
                    if (r.state.mode === "INSERT")
                        setTextInputKey((k) => k + 1);
                    return;
                }
                // Unrecognized key in NORMAL mode (e.g. paste burst, typing
                // without switching to INSERT first): insert the character
                // directly and switch to INSERT mode. The keystroke is consumed
                // by useInput (TextInput has focus=false in NORMAL mode), so we
                // must append it to the value ourselves.
                if (inputCh && inputCh.length === 1) {
                    const pos = vimState.cursor;
                    props.onChange(props.value.slice(0, pos) + inputCh + props.value.slice(pos));
                }
                setVimState((s) => ({ ...s, mode: "INSERT", pending: "", cursor: s.cursor + (inputCh?.length ?? 0) }));
                setTextInputKey((k) => k + 1);
                return;
            }
        }
    }, { isActive: focus });
    const borderColour = props.busy ? palette.brand : palette.accent;
    const promptColour = props.busy ? palette.brand : palette.accent;
    const collapsed = pasteSegment !== null && !pasteExpanded;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { borderStyle: "single", borderTop: true, borderBottom: false, borderLeft: false, borderRight: false, borderColor: borderColour, height: 0 }), _jsx(Box, { paddingX: 1, children: _jsxs(Box, { gap: 1, flexGrow: 1, children: [_jsx(Text, { color: promptColour, children: "\u276F" }), collapsed && pasteSegment !== null ? (_jsx(PasteCollapseView, { value: props.value, segment: pasteSegment, expanded: false, palette: palette })) : (_jsx(TextInput, { value: props.value, onChange: handleChange, onSubmit: props.onSubmit, placeholder: props.placeholder ?? "Ask dirgha anything…", showCursor: !props.busy, focus: focus && !vimActive }, textInputKey))] }) }), _jsxs(Box, { paddingX: 1, justifyContent: "space-between", children: [_jsxs(Box, { gap: 1, children: [props.vimMode === true && (_jsxs(Text, { color: vimActive ? palette.accent : palette.brand, bold: true, children: ["[", vimModeLabel(vimState.mode), "]"] })), pasteSegment !== null && pasteExpanded && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: "pasted block expanded (Ctrl+E collapse)" })), props.busy && (_jsx(BusyHint, { palette: palette, liveDurationMs: props.liveDurationMs, vimMode: props.vimMode === true }))] }), ctrlCArmed && (_jsx(Text, { color: palette.accent, bold: true, children: "Press Ctrl+C again to exit." }))] })] }));
}
function vimModeLabel(m) {
    return m === "NORMAL" ? "NORMAL" : "INSERT";
}
/**
 * Busy-state hint with a live elapsed-second counter, matching
 * gemini-cli's `(esc to cancel, 12s)` pattern.
 *
 * Elapsed seconds come from the `liveDurationMs` prop that App.tsx already
 * updates on a 1s interval — no second internal timer needed.
 */
function BusyHint({ palette, liveDurationMs, vimMode, }) {
    const elapsed = Math.floor((liveDurationMs ?? 0) / 1000);
    const label = elapsed < 60
        ? `${elapsed}s`
        : elapsed < 3600
            ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
            : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
    const escLabel = vimMode ? "esc normal" : "esc cancel";
    return (_jsxs(Text, { color: palette.textMuted, children: [escLabel, " \u00B7 ", label, " \u00B7 ctrl+c stop"] }));
}
//# sourceMappingURL=InputBox.js.map