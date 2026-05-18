/**
 * Transcript scroll hook — pinned-absolute-index virtual scrolling.
 *
 * Instead of a relative offset from bottom (which shifts when new items
 * arrive), this uses a pinnedEndIdx — the absolute index of the last
 * visible item. When the user scrolls up, pinnedEndIdx stays fixed so
 * new streaming items never push the viewport. Auto-scroll only fires
 * when the user was at the bottom before the new item arrived.
 *
 * PageUp:   scroll up by half the terminal height (≈ 4 items at 24 rows)
 * PageDown: scroll down by half the terminal height
 *
 * When the input box is focused, only Ctrl+PageUp / Ctrl+PageDown are
 * intercepted so they don't collide with normal text navigation.
 * When the input box is NOT focused, plain PageUp/PageDown work.
 */
export interface TranscriptScrollState {
    /** Absolute index of the last visible item (exclusive end bound). */
    pinnedEndIdx: number;
    /** True when pinnedEndIdx >= itemCount (viewing the live tail). */
    isAtBottom: boolean;
    /** Number of items below the current viewport (items.length - pinnedEndIdx). */
    belowCount: number;
    scrollUp: () => void;
    scrollDown: () => void;
    scrollToBottom: () => void;
}
export declare function useTranscriptScroll(itemCount: number, visibleCount: number, autoScroll: boolean, inputFocus: boolean): TranscriptScrollState;
