/**
 * Append-only audit writer. The `dirgha audit list/tail/search` reader
 * already exists at ~/.dirgha/audit/events.jsonl; this module is the
 * producer side that was missing — without it, the audit subcommand
 * always reported "no audit entries yet".
 *
 * Every append swallows errors. Audit writes must never break the
 * actual CLI run; missing audit entries are a degraded feature, not
 * a fatal failure.
 */
export interface AuditEntry {
    ts: string;
    kind: string;
    actor?: string;
    summary?: string;
    [key: string]: unknown;
}
export declare function appendAudit(partial: {
    kind: string;
    actor?: string;
    summary?: string;
    [key: string]: unknown;
}): Promise<void>;
