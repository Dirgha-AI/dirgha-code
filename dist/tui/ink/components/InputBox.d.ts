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
export interface InputBoxProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
    busy: boolean;
    /** Live elapsed ms for the current turn — drives BusyHint without a separate timer. */
    liveDurationMs?: number;
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
export declare function InputBox(props: InputBoxProps): React.JSX.Element;
