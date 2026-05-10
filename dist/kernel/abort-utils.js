export function raceSignals(...signals) {
    const controller = new AbortController();
    const removers = [];
    // Auto-remove listeners when the combined controller aborts.
    controller.signal.addEventListener("abort", () => {
        for (const remove of removers)
            remove();
        removers.length = 0;
    }, { once: true });
    const abortIfNeeded = () => {
        if (!controller.signal.aborted) {
            controller.abort();
        }
    };
    // Abort immediately if any signal is already aborted.
    for (const sig of signals) {
        if (sig.aborted) {
            abortIfNeeded();
            break;
        }
    }
    // Listen for future aborts on the remaining signals.
    for (const sig of signals) {
        if (controller.signal.aborted)
            break;
        if (sig.aborted)
            continue;
        const onAbort = () => {
            abortIfNeeded();
        };
        sig.addEventListener("abort", onAbort, { once: true });
        removers.push(() => {
            sig.removeEventListener("abort", onAbort);
        });
    }
    return {
        signal: controller.signal,
        cancel: () => {
            for (const remove of removers)
                remove();
            removers.length = 0;
        },
    };
}
//# sourceMappingURL=abort-utils.js.map