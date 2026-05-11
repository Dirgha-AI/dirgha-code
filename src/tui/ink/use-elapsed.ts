/**
 * Shared elapsed-time hook — replaces in-render Date.now() calls with a
 * single module-level interval so that all live elapsed displays tick
 * together instead of each running their own timer.
 *
 * `isLive` gates the tick subscription. When false (tool finished, value
 * frozen), the hook returns the current elapsed string but adds NO
 * listener to the global tick — the parent component does not re-render
 * once per second for a value that is no longer changing. Mounted-but-
 * idle tool boxes were the source of the 1 Hz body flicker users saw
 * after a few tool calls.
 *
 * The interval is restarted on terminal resize so the tick rate adapts
 * to the new terminal size (mobile rotation, window resize).
 */

import * as React from "react";
import { statusbarTickMs } from "./is-small-terminal.js";

let _tick = 0;
let _interval: ReturnType<typeof setInterval> | null = null;
const _listeners = new Set<() => void>();

function ensureTick(): void {
  if (_interval !== null) return;
  _interval = setInterval(() => {
    _tick++;
    for (const fn of _listeners) fn();
  }, statusbarTickMs());
}

// Restart the interval at the new rate when terminal size changes.
if (typeof process !== "undefined" && process.stdout) {
  process.stdout.on("resize", () => {
    if (_interval !== null) {
      clearInterval(_interval);
      _interval = null;
      if (_listeners.size > 0) ensureTick();
    }
  });
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function useElapsed(startMs: number, isLive: boolean = true): string {
  const [, forceUpdate] = React.useState(0);

  React.useEffect(() => {
    if (!isLive) return;
    ensureTick();
    const listener = (): void => {
      forceUpdate((n) => n + 1);
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
      if (_listeners.size === 0 && _interval !== null) {
        clearInterval(_interval);
        _interval = null;
      }
    };
  }, [isLive]);

  const elapsed = Date.now() - startMs;
  return formatElapsed(elapsed);
}

// Test-only accessor — the regression suite asserts that the global
// listener set is empty when no tool box is in the live state, proving
// idle tool history doesn't keep the 1 Hz tick alive.
export function _listenerCountForTests(): number {
  return _listeners.size;
}
