/**
 * Local SQLite chat database.
 *
 * Stores messages from all sessions in a queryable SQLite database at
 * ~/.dirgha/dirgha.db. Runs alongside the existing JSONL session store
 * (which remains the source of truth for replay). The DB adds search,
 * history browsing, and analytics that JSONL can't support.
 *
 * Uses better-sqlite3 for synchronous, zero-config SQLite.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
const DB_DIR = join(homedir(), ".dirgha");
const DB_PATH = join(DB_DIR, "dirgha.db");
// Lazy singleton — only opened when first needed.
let _db = null;
function getDb() {
    if (_db)
        return _db;
    try {
        const Database = require("better-sqlite3");
        mkdirSync(DB_DIR, { recursive: true });
        _db = new Database(DB_PATH);
        _db.pragma("journal_mode = WAL");
        _db.pragma("synchronous = NORMAL");
        initSchema(_db);
        return _db;
    }
    catch (err) {
        throw new Error(`SQLite unavailable (optional feature) — run "dirgha setup --features" to install.`);
    }
}
function initSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      model TEXT,
      cwd TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content, session_id UNINDEXED, role UNINDEXED,
      content='messages', content_rowid='id'
    );
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, session_id, role)
      VALUES (new.id, new.content, new.session_id, new.role);
    END;
  `);
}
export function dbOpenSession(id, model, cwd) {
    try {
        const db = getDb();
        db.prepare("INSERT OR IGNORE INTO sessions(id, model, cwd, started_at) VALUES (?, ?, ?, ?)").run(id, model ?? null, cwd ?? null, Date.now());
    }
    catch {
        /* never block the CLI */
    }
}
export function dbCloseSession(id) {
    try {
        const db = getDb();
        db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(Date.now(), id);
    }
    catch {
        /* never block the CLI */
    }
}
export function dbAppendMessage(sessionId, message) {
    try {
        const db = getDb();
        const content = typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content);
        db.prepare("INSERT INTO messages(session_id, role, content, ts) VALUES (?, ?, ?, ?)").run(sessionId, message.role, content, Date.now());
    }
    catch {
        /* never block the CLI */
    }
}
export function dbSearchChats(query, limit = 20) {
    try {
        const db = getDb();
        return db
            .prepare(`
      SELECT m.session_id as sessionId, m.role, m.content, m.ts
      FROM messages_fts f
      JOIN messages m ON m.id = f.rowid
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)
            .all(query, limit);
    }
    catch {
        return [];
    }
}
export function isSqliteAvailable() {
    try {
        getDb();
        return true;
    }
    catch {
        return false;
    }
}
export function dbListSessions(limit = 20) {
    try {
        const db = getDb();
        return db
            .prepare(`
      SELECT s.id, s.model, s.started_at, s.ended_at,
             COUNT(m.id) as messageCount
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT ?
    `)
            .all(limit);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=db.js.map