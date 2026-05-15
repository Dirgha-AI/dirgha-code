/**
 * Flicker detector — checks whether the React tree height would exceed
 * terminal rows, which causes scrollback flicker.
 *
 * The hook doesn't measure actual ANSI output; it compares an estimated
 * line count against terminal height (from useStdout). A warning is
 * emitted to stderr once per session the first time overflow is detected.
 */
import * as React from "react";
import { useStdout } from "ink";
export function useFlickerDetector(lineCount = 0) {
    const { stdout } = useStdout();
    const rows = stdout?.rows ?? 24;
    const frameCountRef = React.useRef(0);
    const overflowRef = React.useRef(false);
    const warnedRef = React.useRef(false);
    // Increment in effect, not during render — avoids side-effect-in-render
    // and double-increment in React strict mode.
    React.useEffect(() => {
        frameCountRef.current++;
    });
    // Detect overflow on every frame (including the first few), but only
    // warn after frame 5 to avoid false-positive startup messages. The
    // overflowRef is set from frame 1 so the caller's `_maxLiveItems` cap
    // engages proactively instead of waiting for 5 frames of jitter before
    // limiting live item count.
    if (lineCount > rows) {
        overflowRef.current = true;
        if (frameCountRef.current > 5 && !warnedRef.current) {
            warnedRef.current = true;
            if (process.env.DIRGHA_DEBUG === "1" || process.env.DIRGHA_FLICKER_WARN === "1") {
                console.error(`[Dirgha] Frame overflow detected — ${lineCount - rows} lines above terminal height.`);
            }
        }
    }
    return {
        overflowDetected: overflowRef.current,
        frameCount: frameCountRef.current,
    };
}
//# sourceMappingURL=use-flicker-detector.js.map