/**
 * Append-only, hash-chained audit log. Every entry is a JSON object
 * carrying `prevHash` and `hash`; verify() walks the chain and detects
 * tampering.
 *
 * The module also maintains an in-memory pending buffer so callers can
 * drain recent entries at turn-end and push them to the gateway:
 *
 *   const entries = await drainPending();
 *   await pushAuditEntries(sessionId, entries, token);
 */
export type AuditKind = 'tool_call' | 'approval' | 'policy_decision' | 'error' | 'model_call' | 'session_start' | 'session_end';
export interface AuditEntry {
    id: string;
    ts: string;
    sessionId?: string;
    kind: AuditKind;
    payload: unknown;
    prevHash: string;
    hash: string;
}
export interface AuditLog {
    record(kind: AuditKind, payload: unknown, sessionId?: string): Promise<void>;
    read(date?: string): Promise<AuditEntry[]>;
    verify(date?: string): Promise<{
        valid: boolean;
        brokenAt?: string;
    }>;
}
export interface AuditLogOptions {
    directory?: string;
}
export declare function createAuditLog(opts?: AuditLogOptions): AuditLog;
/**
 * Return all audit entries written since the last call to `drainPending()`
 * and clear the internal buffer.
 *
 * Designed for turn-end telemetry: the agent loop calls this after each
 * turn and forwards the result to `pushAuditEntries()` for gateway upload.
 * The function is synchronous in all but name — it never performs I/O.
 */
export declare function drainPending(): Promise<AuditEntry[]>;
