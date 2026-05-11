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
export declare function useElapsed(startMs: number, isLive?: boolean): string;
export declare function _listenerCountForTests(): number;
