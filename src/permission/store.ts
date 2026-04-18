/**
 * permission/store.ts — Persist per-tool permission decisions in SQLite.
 *
 * Table: tool_permissions
 *   Only 'always_allow' and 'always_deny' decisions are persisted across calls.
 *   'once' decisions are inserted for audit logging but not returned on lookup.
 */
import { getDB } from '../session/db.js';

export type PermDecision = 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny';

export function initPermissionStore(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_permissions (
      tool       TEXT NOT NULL,
      decision   TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tool_permissions_tool
      ON tool_permissions(tool) WHERE decision IN ('always_allow', 'always_deny');
  `);
}

/**
 * Returns a stored persistent decision ('always_allow' | 'always_deny') for the
 * given tool, or null if none exists.
 */
export function getStoredDecision(tool: string): PermDecision | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT decision FROM tool_permissions
    WHERE tool = ? AND decision IN ('always_allow', 'always_deny')
    ORDER BY created_at DESC LIMIT 1
  `).get(tool) as { decision: string } | undefined;
  return row ? (row.decision as PermDecision) : null;
}

/**
 * Stores a decision. Persistent decisions ('always_*') upsert via INSERT OR REPLACE.
 * Once decisions are inserted as plain rows for audit logging.
 */
export function storeDecision(tool: string, decision: PermDecision): void {
  const db = getDB();
  if (decision === 'always_allow' || decision === 'always_deny') {
    // Remove any prior persistent decision for this tool first, then insert.
    db.prepare(`
      DELETE FROM tool_permissions WHERE tool = ? AND decision IN ('always_allow', 'always_deny')
    `).run(tool);
  }
  db.prepare(`
    INSERT INTO tool_permissions (tool, decision) VALUES (?, ?)
  `).run(tool, decision);
}
