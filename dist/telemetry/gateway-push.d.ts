/**
 * Push CLI audit entries to the Dirgha gateway so they surface in the
 * web IDE dashboard under the active agent session.
 *
 * Every function here is fire-and-forget: network errors, auth failures,
 * and timeouts are all silently swallowed. Telemetry must never crash or
 * slow down the CLI.
 */
import type { AuditEntry } from '../safety/audit-log.js';
/**
 * POST each audit entry to the gateway's agent-session log endpoint.
 *
 * @param sessionId  The agent session ID (from AgentLoopConfig).
 * @param entries    Audit entries returned by `drainPending()`.
 * @param token      JWT bearer token from `~/.dirgha/credentials.json`.
 */
export declare function pushAuditEntries(sessionId: string, entries: AuditEntry[], token: string): Promise<void>;
