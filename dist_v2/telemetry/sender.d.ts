/**
 * Posthog event sender for `dirgha telemetry` opt-in users.
 *
 * Privacy: see docs/privacy/CLI-TELEMETRY.md. We only send what is
 * declared there: version, OS family, Node version, command name,
 * error class, anonymous session id. Never prompts, responses, file
 * contents, keys, or PII.
 *
 * Implementation notes:
 *   - Uses Posthog's public capture endpoint (https://us.i.posthog.com/i/v0/e/)
 *     with a `phc_…` project public key. These keys are designed to be
 *     embedded in client code; they only allow event capture, not data
 *     read or admin operations.
 *   - Fire-and-forget: a 1.5s timeout, drops silently on any error.
 *     Telemetry failure must NEVER affect the user's command.
 *   - Sender is a no-op when `readTelemetryConfig().enabled === false`.
 *   - The endpoint is configurable via `dirgha telemetry endpoint <url>`
 *     for self-hosted Posthog or alternative collectors.
 */
/**
 * Minimal telemetry payload. We deliberately avoid os_release, arch,
 * and duration_ms — they add fingerprinting surface without giving us
 * actionable signal at our scale. If a real bug needs that detail we
 * ask the user to file an issue with `dirgha doctor` output instead.
 *
 * Five fields total (six on error events with error_class):
 *   - event:        'cli_command' | 'cli_error' | other
 *   - version:      semver of @dirgha/code
 *   - os:           'linux' | 'macos' | 'win'  (no kernel version)
 *   - node:         'v22' | 'v20'              (major only)
 *   - command:      the verb the user invoked (e.g. 'doctor', 'ask')
 *   - error_class:  optional, only on cli_error events
 */
export interface TelemetryEvent {
    event: string;
    command?: string;
    version: string;
    os: string;
    node: string;
    error_class?: string;
}
/**
 * Stable, anonymous distinct_id. Hashed from the session id we minted
 * on opt-in (~/.dirgha/telemetry-id) so the value never leaves the user's
 * machine in raw form. SHA-256 truncated to 16 hex chars (64 bits) — large
 * enough to avoid collisions in our cohort, small enough to fit in a row.
 */
declare function distinctId(sessionId: string): string;
/** Build the Posthog properties object — strictly the minimal fields. */
declare function buildProperties(ev: TelemetryEvent): Record<string, string>;
/**
 * Send a single event. Returns true on success, false otherwise (incl.
 * when telemetry is disabled). Never throws — telemetry must never
 * affect the calling code path.
 */
export declare function sendEvent(ev: TelemetryEvent): Promise<boolean>;
/** Convenience for command-launch events. Five-field minimum payload. */
export declare function trackCommand(command: string, version: string): Promise<boolean>;
/** Convenience for error events. Six-field payload (adds error_class). */
export declare function trackError(errorClass: string, command: string, version: string): Promise<boolean>;
/**
 * Test hook — the unit tests assert that disabled config + missing
 * sessionId both short-circuit before any network call. Exported so
 * the test can verify without touching real Posthog.
 */
export declare const __test: {
    distinctId: typeof distinctId;
    buildProperties: typeof buildProperties;
    POSTHOG_PUBLIC_KEY: string;
    DEFAULT_HOST: string;
};
export {};
