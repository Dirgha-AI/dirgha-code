/**
 * billing/db.ts — SQLite persistence for usage tracking
 */
import { getDB } from '../session/db.js';
import type { UsageRecord, ToolUsageRecord } from './types.js';

export function migrateBillingTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      model       TEXT NOT NULL,
      provider    TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      tool_calls  INTEGER NOT NULL DEFAULT 0,
      cost_usd    REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_records(created_at);

    CREATE TABLE IF NOT EXISTS tool_usage (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      tool_name   TEXT NOT NULL,
      args        TEXT NOT NULL DEFAULT '{}',
      result      TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_usage(session_id);

    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id     TEXT NOT NULL,
      date        TEXT NOT NULL,
      tier        TEXT NOT NULL DEFAULT 'free',
      tokens      INTEGER NOT NULL DEFAULT 0,
      cost_usd    REAL NOT NULL DEFAULT 0,
      requests    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    );
  `);
}

export function saveUsageRecord(record: UsageRecord): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO usage_records (id, session_id, model, provider, input_tokens, output_tokens, tool_calls, cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.sessionId,
    record.model,
    record.provider,
    record.inputTokens,
    record.outputTokens,
    record.toolCalls,
    record.costUsd,
    record.createdAt
  );
}

export function saveToolUsage(record: ToolUsageRecord): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO tool_usage (id, session_id, tool_name, args, result, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.sessionId,
    record.toolName,
    JSON.stringify(record.args),
    record.result,
    record.durationMs,
    record.createdAt
  );
}

export function getDailyUsage(userId: string, date: string): { tokens: number; costUsd: number; requests: number } {
  const db = getDB();
  const row = db.prepare(`
    SELECT tokens, cost_usd, requests FROM daily_usage WHERE user_id = ? AND date = ?
  `).get(userId, date) as { tokens: number; cost_usd: number; requests: number } | undefined;
  
  return {
    tokens: row?.tokens ?? 0,
    costUsd: row?.cost_usd ?? 0,
    requests: row?.requests ?? 0,
  };
}

export function incrementDailyUsage(
  userId: string,
  date: string,
  tier: string,
  tokens: number,
  costUsd: number
): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO daily_usage (user_id, date, tier, tokens, cost_usd, requests)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET
      tokens = tokens + ?,
      cost_usd = cost_usd + ?,
      requests = requests + 1
  `).run(userId, date, tier, tokens, costUsd, tokens, costUsd);
}

export function getMonthlyUsage(userId: string, yearMonth: string): number {
  const db = getDB();
  const result = db.prepare(`
    SELECT SUM(tokens) as total FROM daily_usage 
    WHERE user_id = ? AND date LIKE ?
  `).get(userId, `${yearMonth}%`) as { total: number | null };
  return result.total ?? 0;
}
