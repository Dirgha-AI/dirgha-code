/**
 * Opt-in anonymised telemetry. Disabled by default; when enabled, posts
 * a small JSON envelope to the configured endpoint. Content is never
 * transmitted — only command name, duration, model, and success state.
 */

export interface TelemetryEvent {
  command: string;
  model?: string;
  durationMs?: number;
  success: boolean;
  errorReason?: string;
}

export interface TelemetryOptions {
  enabled: boolean;
  endpoint?: string;
  timeoutMs?: number;
  anonId?: string;
}

export interface Telemetry {
  record(event: TelemetryEvent): Promise<void>;
}

export function createTelemetry(opts: TelemetryOptions): Telemetry {
  if (!opts.enabled) {
    return { async record() { /* disabled */ } };
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
      } catch {
        // Telemetry is fire-and-forget; failures are swallowed.
      }
    },
  };
}
