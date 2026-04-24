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
export function InputBox(props) {
    const { stdout } = useStdout();
    const { exit } = useApp();
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
    // Invalidate paste-collapse if the buffer shrinks past the pasted region.
    React.useEffect(() => {
        if (pasteSegment === null)
            return;
        if (props.value.length < pasteSegment.end) {
            setPasteSegment(null);
            setPasteExpanded(false);
        }
    }, [props.value, pasteSegment]);
    // Wrap onChange so we can detect paste bursts and strip pending `@` updates.
    const handleChange = React.useCallback((next) => {
        const prev = prevValueRef.current;
        prevValueRef.current = next;
        const seg = detectPaste(prev, next);
        if (seg !== null) {
            setPasteSegment(seg);
            setPasteExpanded(false);
        }
        props.onChange(next);
    }, [props]);
    useInput((inputCh, key) => {
        // Ctrl+C handling (two-press exit) — highest priority.
        if (key.ctrl && inputCh === 'c') {
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
    const borderColour = props.busy ? 'cyan' : 'magenta';
    const promptColour = props.busy ? 'cyan' : 'magenta';
    const collapsed = pasteSegment !== null && !pasteExpanded;
    return (_jsxs(Box, { flexDirection: "column", width: cols, children: [_jsx(Box, { borderStyle: "single", borderColor: borderColour, paddingX: 1, children: _jsxs(Box, { gap: 1, flexGrow: 1, children: [_jsx(Text, { color: promptColour, children: "\u276F" }), collapsed && pasteSegment !== null ? (_jsx(PasteCollapseView, { value: props.value, segment: pasteSegment, expanded: false })) : (_jsx(TextInput, { value: props.value, onChange: handleChange, onSubmit: props.onSubmit, placeholder: props.placeholder ?? 'Ask dirgha anything…', showCursor: !props.busy && !vimActive, focus: focus && !vimActive }))] }) }), _jsxs(Box, { paddingX: 1, justifyContent: "space-between", children: [_jsxs(Box, { gap: 1, children: [props.vimMode === true && (_jsxs(Text, { color: vimActive ? 'yellow' : 'green', bold: true, children: ["[", vimModeLabel(vimState.mode), "]"] })), pasteSegment !== null && pasteExpanded && (_jsx(Text, { color: "gray", dimColor: true, children: "pasted block expanded (Ctrl+E collapse)" }))] }), ctrlCArmed && _jsx(Text, { color: "yellow", children: "Press Ctrl+C again to exit." })] })] }));
}
function vimModeLabel(m) {
    return m === 'NORMAL' ? 'NORMAL' : 'INSERT';
}
//# sourceMappingURL=InputBox.js.map