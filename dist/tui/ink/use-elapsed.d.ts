/**
 * Shared elapsed-time hook — replaces in-render Date.now() calls with a
 * single module-level 1s interval so that all live elapsed displays tick
 * together instead of each running their own timer.
 */
export declare function useElapsed(startMs: number): string;
