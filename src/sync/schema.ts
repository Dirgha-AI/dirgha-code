import { getDB } from '../session/db.js';

export function initSyncTables(db: import('better-sqlite3').Database = getDB()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_status (
      project_id TEXT PRIMARY KEY,
      last_sync_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_facts_sync ON curated_facts(project_id, synced_at);
  `);
}
