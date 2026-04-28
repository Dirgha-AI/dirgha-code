/**
 * Dirgha Web Dashboard — localhost-only HTTP server for audit events.
 *
 * Security model:
 * - Binds exclusively to localhost (127.0.0.1) by default; never exposes to external interfaces.
 * - Read-only: serves a static HTML dashboard with no write endpoints.
 * - No authentication: intended for local use by the machine's user.
 * - Audit data is read from ~/.dirgha/audit/events.jsonl; no modification.
 */
export interface AuditEntry {
    ts: string;
    kind: string;
    actor?: string;
    summary?: string;
    [key: string]: unknown;
}
export interface StartWebServerOptions {
    port?: number;
    host?: string;
    auditFile?: string;
}
export interface RunningWebServer {
    url: string;
    close(): Promise<void>;
}
export declare function renderAuditPage(entries: AuditEntry[], opts?: {
    limit?: number;
}): string;
export declare function readAuditEntries(file: string, limit?: number): Promise<AuditEntry[]>;
export declare function startWebServer(opts?: StartWebServerOptions): Promise<RunningWebServer>;
