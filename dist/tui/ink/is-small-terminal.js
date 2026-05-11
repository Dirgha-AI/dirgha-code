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
export function isSmallTerminal() {
    try {
        const cols = process.stdout.columns ?? 80;
        const rows = process.stdout.rows ?? 24;
        return cols < 80 || rows < 30;
    }
    catch {
        return false;
    }
}
/** Flush delay floor (ms) — 200 on small terminals, 80 on desktop. */
export function minFlushMs() { return isSmallTerminal() ? 200 : 80; }
/** Spinner interval (ms) — 200 on small terminals, 80 on desktop. */
export function spinnerIntervalMs() { return isSmallTerminal() ? 200 : 80; }
/** StatusBar tok/s tick interval (ms) — 3000 on small terminals, 1000 on desktop. */
export function statusbarTickMs() { return isSmallTerminal() ? 3000 : 1000; }
//# sourceMappingURL=is-small-terminal.js.map