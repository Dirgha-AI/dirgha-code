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
import * as React from "react";
import { useInput, useStdout } from "ink";
export function useTranscriptScroll(itemCount, autoScroll, inputFocus) {
    const { stdout } = useStdout();
    const rows = stdout?.rows ?? 24;
    const pageStep = Math.max(1, Math.floor(rows / 6));
    const [scrollOffset, setScrollOffset] = React.useState(0);
    const userScrolledRef = React.useRef(false);
    const prevItemCountRef = React.useRef(itemCount);
    React.useEffect(() => {
        const prev = prevItemCountRef.current;
        prevItemCountRef.current = itemCount;
        if (itemCount > prev && autoScroll && !userScrolledRef.current) {
            setScrollOffset(0);
            // keep the ref in sync with the state we just set
            userScrolledRef.current = false;
        }
    }, [itemCount, autoScroll]);
    const isAtBottom = scrollOffset === 0;
    const doScrollUp = React.useCallback(() => {
        // Clamp to 0 so an empty transcript (itemCount === 0) never sets
        // scrollOffset to -1, which would break the isAtBottom invariant.
        setScrollOffset((prev) => Math.max(0, Math.min(Math.max(0, itemCount - rows), prev + 1)));
        userScrolledRef.current = true;
    }, [itemCount, rows]);
    const doScrollDown = React.useCallback(() => {
        setScrollOffset((prev) => {
            const next = Math.max(0, prev - 1);
            if (next === 0)
                userScrolledRef.current = false;
            return next;
        });
    }, []);
    const pageUp = React.useCallback(() => {
        setScrollOffset((prev) => Math.max(0, Math.min(Math.max(0, itemCount - rows), prev + pageStep)));
        userScrolledRef.current = true;
    }, [itemCount, rows, pageStep]);
    const pageDown = React.useCallback(() => {
        setScrollOffset((prev) => {
            const next = Math.max(0, prev - pageStep);
            if (next === 0)
                userScrolledRef.current = false;
            return next;
        });
    }, [pageStep]);
    const scrollToBottom = React.useCallback(() => {
        userScrolledRef.current = false;
        setScrollOffset(0);
    }, []);
    // Register the page‑up / page‑down listener and clean it up on unmount.
    const unsubscribeInput = useInput((_ch, key) => {
        if (inputFocus) {
            if (key.ctrl && key.pageUp) {
                pageUp();
            }
            else if (key.ctrl && key.pageDown) {
                pageDown();
            }
        }
        else {
            if (key.pageUp) {
                pageUp();
            }
            else if (key.pageDown) {
                pageDown();
            }
        }
    }, { isActive: true });
    React.useEffect(() => {
        return unsubscribeInput;
    }, [unsubscribeInput]);
    return {
        scrollOffset,
        isAtBottom,
        scrollUp: doScrollUp,
        scrollDown: doScrollDown,
        scrollToBottom,
    };
}
//# sourceMappingURL=use-transcript-scroll.js.map