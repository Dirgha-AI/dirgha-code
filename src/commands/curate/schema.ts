/**
 * Database Schema for Curated Facts
 * @module commands/curate/schema
 */
import { getDB } from '../../session/db.js';

export function ensureSchema(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS curated_facts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      embedding BLOB,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      tags TEXT DEFAULT '[]',
      project_id TEXT
    );
    CREATE TABLE IF NOT EXISTS fact_files (
      fact_id TEXT,
      file_path TEXT,
      line_start INTEGER,
      line_end INTEGER,
      PRIMARY KEY (fact_id, file_path),
      FOREIGN KEY (fact_id) REFERENCES curated_facts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_facts_project ON curated_facts(project_id);
    CREATE INDEX IF NOT EXISTS idx_facts_tags ON curated_facts(tags);
  `);
}
