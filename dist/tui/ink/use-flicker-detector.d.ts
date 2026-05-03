/**
 * Flicker detector — checks whether the React tree height would exceed
 * terminal rows, which causes scrollback flicker.
 *
 * The hook doesn't measure actual ANSI output; it compares an estimated
 * line count against terminal height (from useStdout). A warning is
 * emitted to stderr once per session the first time overflow is detected.
 */
export declare function useFlickerDetector(lineCount?: number): {
    overflowDetected: boolean;
    frameCount: number;
};
