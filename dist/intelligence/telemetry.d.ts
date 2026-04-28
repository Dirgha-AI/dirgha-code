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
export declare function createTelemetry(opts: TelemetryOptions): Telemetry;
