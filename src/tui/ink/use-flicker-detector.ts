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

export function useFlickerDetector(lineCount = 0): {
  overflowDetected: boolean;
  frameCount: number;
} {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const frameCountRef = React.useRef(0);
  const overflowRef = React.useRef(false);
  const warnedRef = React.useRef(false);

  frameCountRef.current++;

  if (lineCount > rows && !warnedRef.current) {
    warnedRef.current = true;
    overflowRef.current = true;
    console.error(
      `[Dirgha] Frame overflow detected — ${lineCount - rows} lines above terminal height.`,
    );
  }

  return {
    overflowDetected: overflowRef.current,
    frameCount: frameCountRef.current,
  };
}
