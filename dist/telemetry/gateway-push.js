/**
 * Push CLI audit entries to the Dirgha gateway so they surface in the
 * web IDE dashboard under the active agent session.
 *
 * Every function here is fire-and-forget: network errors, auth failures,
 * and timeouts are all silently swallowed. Telemetry must never crash or
 * slow down the CLI.
 */
const PUSH_TIMEOUT_MS = 5_000;
/**
 * POST each audit entry to the gateway's agent-session log endpoint.
 *
 * @param sessionId  The agent session ID (from AgentLoopConfig).
 * @param entries    Audit entries returned by `drainPending()`.
 * @param token      JWT bearer token from `~/.dirgha/credentials.json`.
 */
export async function pushAuditEntries(sessionId, entries, token) {
    if (entries.length === 0)
        return;
    const base = (process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai').replace(/\/+$/, '');
    const url = `${base}/api/agent-sessions/${encodeURIComponent(sessionId)}/logs`;
    for (const entry of entries) {
        try {
            const body = JSON.stringify({
                kind: entry.kind,
                ts: entry.ts,
                payload: entry.payload,
                sessionId: entry.sessionId,
            });
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body,
                signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
            });
        }
        catch {
            // Swallow every error — telemetry must never throw.
            if (process.env['DIRGHA_AUDIT_DEBUG']) {
                process.stderr.write(`[gateway-push] failed to push entry ${entry.id}\n`);
            }
        }
    }
}
//# sourceMappingURL=gateway-push.js.map