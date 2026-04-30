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
import * as React from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme-context.js';
import { applyVimKey, createVimState } from './vim-bindings.js';
import { detectPaste, PasteCollapseView } from './PasteCollapse.js';
const CTRL_C_TIMEOUT_MS = 1500;
function lastAtToken(value) {
    // The last `@` must be at column 0 or preceded by whitespace to count.
    const idx = value.lastIndexOf('@');
    if (idx === -1)
        return null;
    if (idx > 0) {
        const prev = value[idx - 1];
        if (prev !== ' ' && prev !== '\t' && prev !== '\n')
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
    if (!value.startsWith('/'))
        return null;
    const tail = value.slice(1);
    const ws = tail.search(/\s/);
    return ws === -1 ? tail : tail.slice(0, ws);
}
export function InputBox(props) {
    const { stdout } = useStdout();
    const { exit } = useApp();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const [ctrlCArmed, setCtrlCArmed] = React.useState(false);
    const armTimerRef = React.useRef(null);
    const [vimState, setVimState] = React.useState(() => createVimState());
    const [pasteSegment, setPasteSegment] = React.useState(null);
    const [pasteExpanded, setPasteExpanded] = React.useState(false);
    const prevValueRef = React.useRef(props.value);
    const focus = props.inputFocus ?? !props.busy;
    const vimActive = props.vimMode === true && vimState.mode === 'NORMAL';
    React.useEffect(() => {
        return () => {
            if (armTimerRef.current)
                clearTimeout(armTimerRef.current);
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
        if (pasteSegment === null)
            return;
        if (props.value.length < pasteSegment.end) {
            setPasteSegment(null);
            setPasteExpanded(false);
        }
    }, [props.value, pasteSegment]);
    // Wrap onChange so we can detect paste bursts, strip raw DEL/BS chars,
    // and strip pending `@` updates.
    const handleChange = React.useCallback((next) => {
        const prev = prevValueRef.current;
        // Strip raw DEL (0x7f) and BS (0x08) characters that slip through when
        // Ink doesn't recognise the terminal's backspace keycode. Without this,
        // terminals that send ^? or ^H for Backspace get literal `` / `` in
        // the buffer instead of a deletion.
        let sanitized = next;
        if (next.includes('\x7f') || next.includes('\x08')) {
            sanitized = next.replace(/[\x7f\x08]/g, '');
            // Emulate backspace: the raw char replaced the character before the
            // cursor. Since we can't know the exact cursor position from here,
            // we do the common case: strip one raw char and remove the character
            // immediately before each occurrence.
            let result = prev;
            for (const ch of next) {
                if (ch === '\x7f' || ch === '\x08') {
                    // Delete the last character (if any) for each backspace.
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
    }, [props]);
    useInput((inputCh, key) => {
        // Ctrl+C handling — highest priority.
        //   1. If the buffer has text → clear it (don't arm exit).
        //   2. If the buffer is empty → arm exit; second press within 1.5s exits.
        // This matches the muscle memory most shells / Claude Code use.
        if (key.ctrl && inputCh === 'c') {
            if (props.value.length > 0) {
                props.onChange('');
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
        // Ctrl+Y — toggle YOLO mode at any time.
        if (key.ctrl && inputCh === 'y') {
            if (props.onRequestYoloToggle)
                props.onRequestYoloToggle();
            return;
        }
        // Overlay hotkeys bubble up to App.
        if (props.onRequestOverlay) {
            if (key.ctrl && inputCh === 'm') {
                props.onRequestOverlay('models');
                return;
            }
            if (key.ctrl && inputCh === 'h') {
                props.onRequestOverlay('help');
                return;
            }
            if (inputCh === '?' && props.value === '' && !key.ctrl && !key.meta) {
                props.onRequestOverlay('help');
                return;
            }
        }
        // Paste-collapse toggle.
        if (key.ctrl && inputCh === 'e' && pasteSegment !== null) {
            setPasteExpanded(v => !v);
            return;
        }
        // Vim mode transitions + NORMAL key handling.
        if (props.vimMode === true) {
            if (key.escape) {
                setVimState(s => ({ ...s, mode: 'NORMAL', pending: '' }));
                return;
            }
            if (vimState.mode === 'NORMAL' && !key.ctrl && !key.meta) {
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
                    return;
                }
            }
        }
    }, { isActive: focus });
    const borderColour = props.busy ? palette.brand : palette.accent;
    const promptColour = props.busy ? palette.brand : palette.accent;
    const collapsed = pasteSegment !== null && !pasteExpanded;
    return (_jsxs(Box, { flexDirection: "column", width: cols, children: [_jsx(Box, { borderStyle: "single", borderColor: borderColour, paddingX: 1, children: _jsxs(Box, { gap: 1, flexGrow: 1, children: [_jsx(Text, { color: promptColour, children: "\u276F" }), collapsed && pasteSegment !== null ? (_jsx(PasteCollapseView, { value: props.value, segment: pasteSegment, expanded: false })) : (_jsx(TextInput, { value: props.value, onChange: handleChange, onSubmit: props.onSubmit, placeholder: props.placeholder ?? 'Ask dirgha anything…', showCursor: !props.busy && !vimActive, focus: focus && !vimActive }))] }) }), _jsxs(Box, { paddingX: 1, justifyContent: "space-between", children: [_jsxs(Box, { gap: 1, children: [props.vimMode === true && (_jsxs(Text, { color: vimActive ? palette.accent : palette.brand, bold: true, children: ["[", vimModeLabel(vimState.mode), "]"] })), pasteSegment !== null && pasteExpanded && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: "pasted block expanded (Ctrl+E collapse)" })), props.busy && _jsx(BusyHint, { palette: palette })] }), ctrlCArmed && _jsx(Text, { color: palette.accent, bold: true, children: "Press Ctrl+C again to exit." })] })] }));
}
function vimModeLabel(m) {
    return m === 'NORMAL' ? 'NORMAL' : 'INSERT';
}
/**
 * Busy-state hint with a live elapsed-second counter, matching
 * gemini-cli's `(esc to cancel, 12s)` pattern. The timer ticks every
 * 1s while busy; cleans up on unmount.
 */
function BusyHint({ palette }) {
    const [elapsed, setElapsed] = React.useState(0);
    React.useEffect(() => {
        const start = Date.now();
        const t = setInterval(() => {
            setElapsed(Math.floor((Date.now() - start) / 1000));
        }, 1000);
        return () => clearInterval(t);
    }, []);
    const label = elapsed < 60 ? `${elapsed}s`
        : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
            : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
    return (_jsxs(Text, { color: palette.textMuted, children: ["esc cancel \u00B7 ", label, " \u00B7 ctrl+c clear"] }));
}
//# sourceMappingURL=InputBox.js.map