/**
 * Transcript scroll hook — manages terminal-height-aware scroll state
 * and PageUp/PageDown key bindings for the virtualized transcript.
 *
 * PageUp:   scroll up by half the terminal height
 * PageDown: scroll down by half the terminal height
 *
 * When the input box is focused, only Ctrl+PageUp / Ctrl+PageDown are
 * intercepted so they don't collide with normal text navigation.
 * When the input box is NOT focused, plain PageUp/PageDown work.
 */
export interface TranscriptScrollState {
    scrollOffset: number;
    isAtBottom: boolean;
    scrollUp: () => void;
    scrollDown: () => void;
    scrollToBottom: () => void;
}
export declare function useTranscriptScroll(itemCount: number, autoScroll: boolean, inputFocus: boolean): TranscriptScrollState;
