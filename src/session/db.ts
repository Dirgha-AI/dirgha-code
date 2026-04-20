/**
 * session/db.ts — Bundled SQLite for persistent memory + file index + sessions
 *
 * Schema:
 *   memories      — key/value memory store with FTS5 for semantic search
 *   file_index    — indexed file content + symbols with FTS5
 *   sessions      — chat sessions
 *   messages      — chat messages per session
 *
 * DB location: ~/.dirgha/dirgha.db
 * better-sqlite3 is kept external in build.mjs so the prebuilt native binary works.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { migrateBillingTables } from '../billing/db.js';

const _require = createRequire(import.meta.url);

let _db: import('better-sqlite3').Database | null = null;

function getDBPath(): string {
  return path.join(os.homedir(), '.dirgha', 'dirgha.db');
}

function loadBetterSqlite3(): typeof import('better-sqlite3') {
  try {
    return _require('better-sqlite3') as typeof import('better-sqlite3');
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'MODULE_NOT_FOUND' && !(e instanceof Error && e.message.includes('NODE_MODULE_VERSION'))) {
      throw e;
    }
    // Native binary missing or ABI mismatch — attempt auto-rebuild
    const pkgDir = path.resolve(path.dirname(_require.resolve('better-sqlite3/package.json')), '..');
    try {
      execSync('npm rebuild better-sqlite3 --loglevel=error', { cwd: pkgDir, stdio: 'pipe' });
    } catch {
      // rebuild failed — try fresh install as last resort
      execSync('npm install better-sqlite3 --legacy-peer-deps --loglevel=error', { cwd: pkgDir, stdio: 'pipe' });
    }
    return _require('better-sqlite3') as typeof import('better-sqlite3');
  }
}

export function getDB(): import('better-sqlite3').Database {
  if (_db) return _db;
  const dbPath = getDBPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const Database = loadBetterSqlite3();
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function addColumnIfMissing(db: import('better-sqlite3').Database, table: string, column: string, definition: string): void {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrate(db: import('better-sqlite3').Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      key       TEXT NOT NULL,
      content   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS memories_key ON memories(key);

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      key, content,
      content='memories',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, key, content) VALUES (new.id, new.key, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, key, content) VALUES ('delete', old.id, old.key, old.content);
      INSERT INTO memories_fts(rowid, key, content) VALUES (new.id, new.key, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, key, content) VALUES ('delete', old.id, old.key, old.content);
    END;

    CREATE TABLE IF NOT EXISTS file_index (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath    TEXT NOT NULL,
      project     TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      symbols     TEXT NOT NULL DEFAULT '',
      indexed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS file_index_path ON file_index(filepath);

    CREATE VIRTUAL TABLE IF NOT EXISTS file_index_fts USING fts5(
      filepath, content, symbols,
      content='file_index',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS file_index_ai AFTER INSERT ON file_index BEGIN
      INSERT INTO file_index_fts(rowid, filepath, content, symbols) VALUES (new.id, new.filepath, new.content, new.symbols);
    END;
    CREATE TRIGGER IF NOT EXISTS file_index_au AFTER UPDATE ON file_index BEGIN
      INSERT INTO file_index_fts(file_index_fts, rowid, filepath, content, symbols) VALUES ('delete', old.id, old.filepath, old.content, old.symbols);
      INSERT INTO file_index_fts(rowid, filepath, content, symbols) VALUES (new.id, new.filepath, new.content, new.symbols);
    END;
    CREATE TRIGGER IF NOT EXISTS file_index_ad AFTER DELETE ON file_index BEGIN
      INSERT INTO file_index_fts(file_index_fts, rowid, filepath, content, symbols) VALUES ('delete', old.id, old.filepath, old.content, old.symbols);
    END;

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      model      TEXT NOT NULL DEFAULT '',
      tokens     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      tokens     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id);

  CREATE TABLE IF NOT EXISTS attachments (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    size        INTEGER NOT NULL DEFAULT 0,
    mime_type   TEXT NOT NULL DEFAULT '',
    content     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS attachments_session ON attachments(session_id);
`);

  addColumnIfMissing(db, 'sessions', 'type', "TEXT NOT NULL DEFAULT 'user'");
  addColumnIfMissing(db, 'sessions', 'working_dir', "TEXT NOT NULL DEFAULT ''");

  // Billing tables
  migrateBillingTables();
}

// ---------------------------------------------------------------------------
// Memory API
// ---------------------------------------------------------------------------

/** Save or update a memory entry by key. Key defaults to a timestamp slug. */
export function saveMemory(content: string, key?: string): void {
  const db = getDB();
  const k = key ?? `mem_${Date.now()}`;
  db.prepare(`
    INSERT INTO memories (key, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET content=excluded.content, updated_at=datetime('now')
  `).run(k, content);
}

/** Full-text search over memories. Returns up to limit results. */
export function searchMemory(query: string, limit = 10): Array<{ key: string; content: string }> {
  const db = getDB();
  try {
    return db.prepare(`
      SELECT m.key, m.content
      FROM memories_fts f
      JOIN memories m ON m.id = f.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{ key: string; content: string }>;
  } catch {
    // Fallback: LIKE search when FTS query syntax is invalid
    return db.prepare(`
      SELECT key, content FROM memories
      WHERE content LIKE ? ORDER BY updated_at DESC LIMIT ?
    `).all(`%${query}%`, limit) as Array<{ key: string; content: string }>;
  }
}

const MEMORY_INJECT_MAX_CHARS = 4000; // ~1000 tokens — enough context, not a budget drain

/** Return recent memories as a formatted string for system prompt injection. Hard-capped to avoid token bloat. */
export function readAllMemory(): string | null {
  const db = getDB();
  const rows = db.prepare(`SELECT key, content FROM memories ORDER BY updated_at DESC LIMIT 20`).all() as Array<{ key: string; content: string }>;
  if (!rows.length) return null;
  let result = '';
  for (const r of rows) {
    const line = `- [${r.key}] ${r.content.slice(0, 300)}\n`;
    if (result.length + line.length > MEMORY_INJECT_MAX_CHARS) break;
    result += line;
  }
  return result.trim() || null;
}

// ---------------------------------------------------------------------------
// File index API
// ---------------------------------------------------------------------------

export function indexFile(filepath: string, content: string, symbols: string, project: string): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO file_index (filepath, project, content, symbols, indexed_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(filepath) DO UPDATE SET
      project=excluded.project, content=excluded.content,
      symbols=excluded.symbols, indexed_at=datetime('now')
  `).run(filepath, project, content.slice(0, 100_000), symbols.slice(0, 10_000));
}

export function searchFiles(query: string, limit = 20): Array<{ filepath: string; snippet: string }> {
  const db = getDB();
  try {
    return db.prepare(`
      SELECT f.filepath, snippet(file_index_fts, 1, '[', ']', '...', 20) AS snippet
      FROM file_index_fts fi
      JOIN file_index f ON f.id = fi.rowid
      WHERE file_index_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{ filepath: string; snippet: string }>;
  } catch {
    return db.prepare(`
      SELECT filepath, substr(content, 1, 200) AS snippet
      FROM file_index WHERE content LIKE ? LIMIT ?
    `).all(`%${query}%`, limit) as Array<{ filepath: string; snippet: string }>;
  }
}

// ---------------------------------------------------------------------------
// Session + message persistence
// ---------------------------------------------------------------------------

export function upsertSession(
  id: string, title: string, model: string, tokens: number,
  type = 'user', workingDir = ''
): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO sessions (id, title, model, tokens, type, working_dir, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, model=excluded.model,
      tokens=excluded.tokens, type=excluded.type,
      working_dir=excluded.working_dir, updated_at=datetime('now')
  `).run(id, title, model, tokens, type, workingDir);
}

export function appendMessage(sessionId: string, role: string, content: string, tokens = 0): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO messages (session_id, role, content, tokens)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, role, content, tokens);
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

const MAX_SESSIONS = 200;
const MAX_MEMORY_ENTRIES = 1000;

/** Prune old sessions to prevent unbounded growth. Keeps most recent MAX_SESSIONS. */
export function pruneOldSessions(): void {
  const db = getDB();
  db.prepare(`
    DELETE FROM sessions
    WHERE id NOT IN (
      SELECT id FROM sessions
      ORDER BY updated_at DESC
      LIMIT ?
    )
  `).run(MAX_SESSIONS);
}

/** Prune old memories to prevent unbounded growth. Keeps most recent MAX_MEMORY_ENTRIES. */
export function pruneOldMemories(): void {
  const db = getDB();
  db.prepare(`
    DELETE FROM memories
    WHERE id NOT IN (
      SELECT id FROM memories
      ORDER BY updated_at DESC
      LIMIT ?
    )
  `).run(MAX_MEMORY_ENTRIES);
}
