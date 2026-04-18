/**
 * checkpoint/store.ts — Checkpoint metadata storage
 */
import { Database } from '../utils/sqlite.js';
import type { Checkpoint, CheckpointMetadata } from './types.js';

export function initCheckpointTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      files TEXT NOT NULL,
      created_at TEXT NOT NULL,
      commit_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project_path);
  `);
}

export function saveCheckpoint(db: Database, cp: Checkpoint): void {
  db.prepare(`
    INSERT INTO checkpoints (id, name, project_path, files, created_at, commit_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cp.id, cp.name, cp.projectPath, JSON.stringify(cp.files), cp.createdAt, cp.commitHash);
}

export function listCheckpoints(db: Database, projectPath: string): CheckpointMetadata[] {
  return db.prepare(`
    SELECT id, name, created_at as createdAt, 
           json_array_length(files) as fileCount, commit_hash as commitHash
    FROM checkpoints WHERE project_path = ? ORDER BY created_at DESC
  `).all(projectPath) as CheckpointMetadata[];
}

export function getCheckpoint(db: Database, id: string): Checkpoint | undefined {
  const row = db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    projectPath: row.project_path,
    files: JSON.parse(row.files),
    createdAt: row.created_at,
    commitHash: row.commit_hash
  };
}
