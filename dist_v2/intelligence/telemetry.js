/**
 * Opt-in anonymised telemetry. Disabled by default; when enabled, posts
 * a small JSON envelope to the configured endpoint. Content is never
 * transmitted — only command name, duration, model, and success state.
 */
export function createTelemetry(opts) {
    if (!opts.enabled) {
        return { async record() { } };
    }
    const endpoint = opts.endpoint ?? 'https://telemetry.dirgha.ai/events';
    const timeout = opts.timeoutMs ?? 2000;
    const anonId = opts.anonId ?? 'anon';
    return {
        async record(event) {
            const payload = { ...event, anonId, ts: new Date().toISOString() };
            try {
                const signal = AbortSignal.timeout(timeout);
                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal,
                });
            }
            catch {
                // Telemetry is fire-and-forget; failures are swallowed.
            }
        },
    };
}
//# sourceMappingURL=telemetry.js.map