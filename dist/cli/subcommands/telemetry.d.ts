/**
 * `dirgha telemetry` — anonymous usage opt-in.
 *
 * Subcommands:
 *   status               Print enabled/disabled, endpoint, session-id tail.
 *   enable               Opt in (writes ~/.dirgha/config.json telemetry.enabled = true).
 *   disable              Opt out (default).
 *   endpoint <url>       Override the upload endpoint.
 *
 * Privacy policy: docs/privacy/CLI-TELEMETRY.md
 *
 * Default behaviour: telemetry is OFF until the user explicitly runs
 * `dirgha telemetry enable` OR responds 'y' to the first-run consent
 * prompt. We NEVER send prompts, responses, file contents, or keys.
 */
import type { Subcommand } from "./index.js";
export interface TelemetryConfig {
    enabled: boolean;
    endpoint: string;
    sessionId: string;
    consentSeen?: boolean;
}
/** Read the current telemetry config, defaulting to opt-out. */
export declare function readTelemetryConfig(): TelemetryConfig;
/** Persist a telemetry config patch. Always writes to ~/.dirgha/config.json. */
export declare function writeTelemetryConfig(patch: Partial<TelemetryConfig>): void;
export declare const telemetrySubcommand: Subcommand;
