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
export type VimMode = "INSERT" | "NORMAL";
export interface VimState {
    mode: VimMode;
    cursor: number;
    pending: string;
    register: string;
}
export declare function createVimState(): VimState;
export interface VimApplyResult {
    value: string;
    state: VimState;
    handled: boolean;
    exitRequested?: boolean;
}
/**
 * Apply a single NORMAL-mode keystroke. Returns the new value + state.
 * If the key didn't do anything NORMAL-mode understands, `handled=false`
 * so the caller can decide whether to fall through.
 */
export declare function applyVimKey(value: string, state: VimState, ch: string): VimApplyResult;
