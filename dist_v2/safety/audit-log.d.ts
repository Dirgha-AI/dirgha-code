/**
 * Append-only, hash-chained audit log. Every entry is a JSON object
 * carrying `prevHash` and `hash`; verify() walks the chain and detects
 * tampering.
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
