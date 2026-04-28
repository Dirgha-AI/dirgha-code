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
import { platform } from 'node:os';
import { createHash } from 'node:crypto';
import { readTelemetryConfig } from '../cli/subcommands/telemetry.js';
// Public Posthog project key — provided by the project owner. This is
// not a secret: the `phc_` prefix denotes a "client-side" key that only
// permits writes to Posthog's `/i/v0/e/` capture endpoint. Read access,
// admin operations, and other projects all require a separate
// `phs_…` (server) or personal API key which we never embed.
const POSTHOG_PUBLIC_KEY = 'phc_nmVd4XhA4PX8U7sk6Nwpr5xYzNAhxYQ2vZXSksfi89uD';
const DEFAULT_HOST = 'https://us.i.posthog.com';
// 8s upper bound: long enough for cold DNS + TLS handshake on slow
// runners (observed 3.2s on the dev VPS for a first-time send to
// us.i.posthog.com). Caller does NOT wait this long — main.ts uses
// Promise.race(50ms) so the user-perceived delay is capped low.
const SEND_TIMEOUT_MS = 8000;
/**
 * Stable, anonymous distinct_id. Hashed from the session id we minted
 * on opt-in (~/.dirgha/telemetry-id) so the value never leaves the user's
 * machine in raw form. SHA-256 truncated to 16 hex chars (64 bits) — large
 * enough to avoid collisions in our cohort, small enough to fit in a row.
 */
function distinctId(sessionId) {
    return createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}
/** Build the Posthog properties object — strictly the minimal fields. */
function buildProperties(ev) {
    const out = {
        version: ev.version,
        os: ev.os,
        node: ev.node,
    };
    if (ev.command !== undefined)
        out.command = ev.command;
    if (ev.error_class !== undefined)
        out.error_class = ev.error_class;
    return out;
}
/** Map raw `os.platform()` to the three buckets we care about. Anything
 *  else falls into 'other' so we never emit raw kernel strings. */
function osBucket(plat) {
    if (plat === 'linux')
        return 'linux';
    if (plat === 'darwin')
        return 'macos';
    if (plat === 'win32')
        return 'win';
    return 'other';
}
/** Major Node version only — drops the patch level so we can't fingerprint
 *  from Node releases beyond what we actually need to detect regressions. */
function nodeMajor(v) {
    const m = v.match(/^v(\d+)/);
    return m ? `v${m[1]}` : 'unknown';
}
/**
 * Send a single event. Returns true on success, false otherwise (incl.
 * when telemetry is disabled). Never throws — telemetry must never
 * affect the calling code path.
 */
export async function sendEvent(ev) {
    try {
        const cfg = readTelemetryConfig();
        if (!cfg.enabled)
            return false;
        if (!cfg.sessionId)
            return false;
        const endpoint = cfg.endpoint && cfg.endpoint.startsWith('http')
            ? cfg.endpoint
            : `${DEFAULT_HOST}/i/v0/e/`;
        const body = {
            api_key: POSTHOG_PUBLIC_KEY,
            event: ev.event,
            distinct_id: distinctId(cfg.sessionId),
            properties: buildProperties(ev),
            timestamp: new Date().toISOString(),
        };
        // AbortSignal.timeout() is the Node 20+ idiomatic way; behaves better
        // than manual setTimeout+AbortController (which was firing prematurely
        // in observed runs — the modern helper handles edge cases like the
        // signal already being aborted at fetch-init time).
        const r = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        return r.ok;
    }
    catch (e) {
        // Swallow EVERY error. Network drop, DNS fail, malformed config —
        // none of it should bubble up to the user. Telemetry is non-essential.
        if (process.env.DIRGHA_TELEMETRY_DEBUG) {
            // Diagnostic-only path; default builds keep this silent.
            console.error('[telemetry] send failed:', e.message);
        }
        return false;
    }
}
/** Convenience for command-launch events. Five-field minimum payload. */
export async function trackCommand(command, version) {
    return sendEvent({
        event: 'cli_command',
        command,
        version,
        os: osBucket(platform()),
        node: nodeMajor(process.version),
    });
}
/** Convenience for error events. Six-field payload (adds error_class). */
export async function trackError(errorClass, command, version) {
    return sendEvent({
        event: 'cli_error',
        command,
        version,
        error_class: errorClass,
        os: osBucket(platform()),
        node: nodeMajor(process.version),
    });
}
/**
 * Test hook — the unit tests assert that disabled config + missing
 * sessionId both short-circuit before any network call. Exported so
 * the test can verify without touching real Posthog.
 */
export const __test = {
    distinctId,
    buildProperties,
    POSTHOG_PUBLIC_KEY,
    DEFAULT_HOST,
};
//# sourceMappingURL=sender.js.map