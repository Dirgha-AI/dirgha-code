export function raceSignals(
  ...signals: AbortSignal[]
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const removers: (() => void)[] = [];

  // Auto-remove listeners when the combined controller aborts.
  controller.signal.addEventListener(
    "abort",
    () => {
      for (const remove of removers) remove();
      removers.length = 0;
    },
    { once: true }
  );

  const abortIfNeeded = (): void => {
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
    if (controller.signal.aborted) break;
    if (sig.aborted) continue;

    const onAbort = (): void => {
      abortIfNeeded();
    };
    sig.addEventListener("abort", onAbort, { once: true });
    removers.push(() => {
      sig.removeEventListener("abort", onAbort);
    });
  }

  return {
    signal: controller.signal,
    cancel: (): void => {
      for (const remove of removers) remove();
      removers.length = 0;
    },
  };
}
