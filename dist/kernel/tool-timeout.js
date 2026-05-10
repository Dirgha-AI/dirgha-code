import { raceSignals } from "./abort-utils.js";
/* ------------------------------------------------------------------ */
/*  withToolTimeout                                                    */
/* ------------------------------------------------------------------ */
/**
 * Wraps a {@link ToolExecutor} so that each call is aborted after
 * `timeoutMs` (or the call‑specific `call.timeoutMs` value, if present).
 *
 * If the timeout fires, the wrapped executor returns a result with
 * `content: "[TIMEOUT] Xms exceeded"` and `isError: true`.
 *
 * @param executor  The original executor to wrap.
 * @param defaultMs Default timeout in milliseconds (300 000 ms = 5 min).
 * @returns A new {@link ToolExecutor} that respects the timeout.
 */
export function withToolTimeout(executor, defaultMs = 300_000) {
    return async (call, outerSignal) => {
        const timeoutMs = call.timeoutMs ?? defaultMs;
        // Own controller for the timeout so we can distinguish a timeout abort
        // from an abort requested by the caller.
        const timeoutCtrl = new AbortController();
        // Combined signal – aborts when either the caller or the timeout fires.
        // `raceSignals` returns an object { signal, cancel } instead of a bare signal.
        const { signal: combinedSignal, cancel: cancelRace } = raceSignals(outerSignal, timeoutCtrl.signal);
        const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
        try {
            // Execute the real tool with the combined abort signal.
            return await executor(call, combinedSignal);
        }
        catch (err) {
            // If the error is an AbortError and the combined signal is aborted
            if (combinedSignal.aborted && err instanceof Error && err.name === 'AbortError') {
                if (timeoutCtrl.signal.aborted) {
                    // Timeout caused the abort – return the timeout result.
                    return {
                        content: `[TIMEOUT] ${timeoutMs}ms exceeded`,
                        isError: true,
                    };
                }
                // Caller aborted – re‑throw so the original error propagates.
                throw err;
            }
            // Any other error (including non‑abort errors even if combinedSignal.aborted)
            throw err;
        }
        finally {
            clearTimeout(timer);
            // Cancel any internal timers owned by `raceSignals`.
            cancelRace();
        }
    };
}
//# sourceMappingURL=tool-timeout.js.map