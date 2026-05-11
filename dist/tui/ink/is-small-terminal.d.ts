/**
 * Detect whether the current terminal is small (phone/tablet SSH).
 *
 * "Small" is defined as fewer than 80 columns or fewer than 30 rows.
 * On these terminals Ink's full-screen escape-sequence repaint is
 * noticeably slower, so upstream consumers should throttle render
 * frequency to reduce visible jitter.
 *
 * NOT cached — terminal size can change mid-session (phone rotation,
 * window resize). Each call reads the live process.stdout dimensions.
 */
export declare function isSmallTerminal(): boolean;
/** Flush delay floor (ms) — 200 on small terminals, 80 on desktop. */
export declare function minFlushMs(): number;
/** Spinner interval (ms) — 200 on small terminals, 80 on desktop. */
export declare function spinnerIntervalMs(): number;
/** StatusBar tok/s tick interval (ms) — 3000 on small terminals, 1000 on desktop. */
export declare function statusbarTickMs(): number;
