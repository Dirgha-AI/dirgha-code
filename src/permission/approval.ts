/**
 * permission/approval.ts — Persistent HITL approval requests (Agno pattern).
 *
 * SQLite table: approvals
 *   id, run_id, tool_name, tool_args, approval_type, status, resolved_by, created_at, resolved_at
 *
 * Slash commands: /approvals list | /approvals approve <id> | /approvals reject <id>
 */
import { getDB } from '../session/db.js';

export type ApprovalType = 'required' | 'audit';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: string;
  runId: string;
  toolName: string;
  toolArgs: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  resolvedBy?: string;
  createdAt: string;
  resolvedAt?: string;
}

function ensureTable(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      tool_args TEXT NOT NULL DEFAULT '{}',
      approval_type TEXT NOT NULL DEFAULT 'required',
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_by TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id);
  `);
}

function rowToRecord(row: any): ApprovalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    approvalType: row.approval_type as ApprovalType,
    status: row.status as ApprovalStatus,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export function createApproval(
  runId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  approvalType: ApprovalType = 'required',
): ApprovalRecord {
  ensureTable();
  const db = getDB();
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO approvals (id, run_id, tool_name, tool_args, approval_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, runId, toolName, JSON.stringify(toolArgs), approvalType, now);
  return { id, runId, toolName, toolArgs: JSON.stringify(toolArgs), approvalType, status: 'pending', createdAt: now };
}

export function resolveApproval(
  id: string,
  status: 'approved' | 'rejected',
  resolvedBy = 'user',
): boolean {
  ensureTable();
  const db = getDB();
  const result = db.prepare(`
    UPDATE approvals SET status = ?, resolved_by = ?, resolved_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(status, resolvedBy, new Date().toISOString(), id);
  return result.changes > 0;
}

export function listApprovals(status?: ApprovalStatus): ApprovalRecord[] {
  ensureTable();
  const db = getDB();
  const rows = status
    ? db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT 50').all(status)
    : db.prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50').all();
  return (rows as any[]).map(rowToRecord);
}

export function getApproval(id: string): ApprovalRecord | null {
  ensureTable();
  const db = getDB();
  const row = db.prepare('SELECT * FROM approvals WHERE id = ? OR id LIKE ?').get(id, `${id}%`);
  return row ? rowToRecord(row) : null;
}

export function getPendingCount(): number {
  try {
    ensureTable();
    const db = getDB();
    const row = db.prepare("SELECT COUNT(*) as n FROM approvals WHERE status = 'pending'").get() as any;
    return row?.n ?? 0;
  } catch { return 0; }
}
