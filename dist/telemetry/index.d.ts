/**
 * Public API for the telemetry package.
 *
 * Re-exports the Posthog event sender and the gateway audit-push helper
 * from a single import point.
 */
export { sendEvent, trackCommand, trackError } from './sender.js';
export type { TelemetryEvent } from './sender.js';
export { pushAuditEntries } from './gateway-push.js';
