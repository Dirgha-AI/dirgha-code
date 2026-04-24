/**
 * Pure reducer for vim-style motions applied to a single-line text buffer.
 *
 * Keeping the state machine side-effect-free lets InputBox call it from
 * its `useInput` handler with no React hooks or I/O. The buffer itself
 * is a simple string; cursor is a character offset in `[0, value.length]`.
 *
 * Supported keys (subset):
 *   h / l         move cursor one char left / right
 *   j / k         move cursor one line up / down (single-line fallback = 0 / $)
 *   0 / $         jump to line start / end
 *   w / b         word jump (whitespace-delimited)
 *   x             delete char under cursor
 *   dd            delete entire line (clear buffer)
 *   dw            delete to next word boundary
 *   yy            yank (copy) whole line into register
 *   p             paste register after cursor
 *   i             return to INSERT mode (handled by caller)
 *   /, :q         stubs — left to the caller
 *
 * The reducer keeps a pending prefix so multi-key motions like `dd`,
 * `dw`, and `yy` work across two keystrokes.
 */
export function createVimState() {
    return { mode: 'INSERT', cursor: 0, pending: '', register: '' };
}
function nextWord(value, from) {
    let i = from;
    // Skip the current word.
    while (i < value.length && /\S/.test(value[i] ?? ''))
        i += 1;
    // Skip whitespace to the next word.
    while (i < value.length && /\s/.test(value[i] ?? ''))
        i += 1;
    return i;
}
function prevWord(value, from) {
    let i = Math.max(0, from - 1);
    while (i > 0 && /\s/.test(value[i] ?? ''))
        i -= 1;
    while (i > 0 && /\S/.test(value[i - 1] ?? ''))
        i -= 1;
    return i;
}
/**
 * Apply a single NORMAL-mode keystroke. Returns the new value + state.
 * If the key didn't do anything NORMAL-mode understands, `handled=false`
 * so the caller can decide whether to fall through.
 */
export function applyVimKey(value, state, ch) {
    const pending = state.pending;
    const clearPending = { ...state, pending: '' };
    // Multi-key prefixes resolve first.
    if (pending === 'd') {
        if (ch === 'd') {
            return {
                value: '',
                state: { ...clearPending, cursor: 0, register: value },
                handled: true,
            };
        }
        if (ch === 'w') {
            const to = nextWord(value, state.cursor);
            return {
                value: value.slice(0, state.cursor) + value.slice(to),
                state: { ...clearPending, register: value.slice(state.cursor, to) },
                handled: true,
            };
        }
        // Unknown d-prefix → abort.
        return { value, state: clearPending, handled: true };
    }
    if (pending === 'y') {
        if (ch === 'y') {
            return { value, state: { ...clearPending, register: value }, handled: true };
        }
        return { value, state: clearPending, handled: true };
    }
    if (pending === ':') {
        if (ch === 'q') {
            return { value, state: clearPending, handled: true, exitRequested: true };
        }
        return { value, state: clearPending, handled: true };
    }
    switch (ch) {
        case 'h':
            return { value, state: { ...clearPending, cursor: Math.max(0, state.cursor - 1) }, handled: true };
        case 'l':
            return { value, state: { ...clearPending, cursor: Math.min(value.length, state.cursor + 1) }, handled: true };
        case 'j':
        case 'k':
            // Single-line buffer: treat as no-op but still consume.
            return { value, state: clearPending, handled: true };
        case '0':
            return { value, state: { ...clearPending, cursor: 0 }, handled: true };
        case '$':
            return { value, state: { ...clearPending, cursor: value.length }, handled: true };
        case 'w':
            return { value, state: { ...clearPending, cursor: nextWord(value, state.cursor) }, handled: true };
        case 'b':
            return { value, state: { ...clearPending, cursor: prevWord(value, state.cursor) }, handled: true };
        case 'x': {
            if (state.cursor >= value.length)
                return { value, state: clearPending, handled: true };
            const nv = value.slice(0, state.cursor) + value.slice(state.cursor + 1);
            return {
                value: nv,
                state: { ...clearPending, cursor: Math.min(state.cursor, nv.length) },
                handled: true,
            };
        }
        case 'p': {
            if (state.register === '')
                return { value, state: clearPending, handled: true };
            const nv = value.slice(0, state.cursor) + state.register + value.slice(state.cursor);
            return {
                value: nv,
                state: { ...clearPending, cursor: state.cursor + state.register.length },
                handled: true,
            };
        }
        case 'd':
        case 'y':
        case ':':
            return { value, state: { ...state, pending: ch }, handled: true };
        case 'i':
            return { value, state: { ...clearPending, mode: 'INSERT' }, handled: true };
        case '/':
            // Search stub — consume so it doesn't fall through to text input.
            return { value, state: clearPending, handled: true };
        default:
            return { value, state: clearPending, handled: false };
    }
}
//# sourceMappingURL=vim-bindings.js.map