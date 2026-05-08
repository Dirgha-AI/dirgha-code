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
import { createRequire } from "node:module";
import { recordDbError, recordDbSuccess } from "./db-telemetry.js";
import { loadVecExtension } from "./vec.js";
const _require = createRequire(import.meta.url);
const DB_DIR = join(homedir(), ".dirgha");
const DB_PATH = join(DB_DIR, "dirgha.db");
// Lazy singleton — only opened when first needed.
let _db = null;
function getDb() {
    if (_db)
        return _db;
    try {
        const Database = _require("better-sqlite3");
        mkdirSync(DB_DIR, { recursive: true });
        _db = new Database(DB_PATH);
        _db.pragma("journal_mode = WAL");
        _db.pragma("synchronous = NORMAL");
        const db = _db;
        initSchema(db);
        migrateSchema(db);
        loadVecExtension(db);
        return db;
    }
    catch {
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
/**
 * Idempotent schema migration for existing databases from earlier CLI
 * versions.  Adds missing columns without data loss; backfills ts from
 * the legacy created_at text column when present.
 *
 * Failures are captured via recordDbError but never thrown — the CLI
 * must continue to work without DB persistence rather than crash.
 */
function migrateSchema(db) {
    try {
        // messages: add ts if it doesn't exist
        const msgCols = db.pragma("table_info(messages)");
        const hasTs = msgCols.some((c) => c.name === "ts");
        const hasCreatedAt = msgCols.some((c) => c.name === "created_at");
        if (!hasTs) {
            db.exec("ALTER TABLE messages ADD COLUMN ts INTEGER NOT NULL DEFAULT 0");
        }
        if (hasCreatedAt) {
            // Backfill ts from legacy text timestamp (once, for rows still at 0).
            db.exec("UPDATE messages SET ts = CAST(strftime('%s', created_at) * 1000 AS INTEGER) WHERE ts = 0 AND created_at IS NOT NULL");
        }
        // sessions: align legacy schemas (some predate the current column set).
        // Earlier CLI versions wrote sessions(id, title, model, tokens,
        // created_at, updated_at, working_dir, ...) — but dbOpenSession's
        // INSERT lists `cwd` and `started_at`. Add any missing columns.
        const sessCols = db.pragma("table_info(sessions)");
        const sessNames = new Set(sessCols.map((c) => c.name));
        if (!sessNames.has("started_at")) {
            db.exec("ALTER TABLE sessions ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0");
        }
        if (!sessNames.has("cwd")) {
            // Default to '' so the NOT-NULL semantics aren't a problem; if the
            // legacy column `working_dir` exists, copy it across as a one-shot.
            db.exec("ALTER TABLE sessions ADD COLUMN cwd TEXT");
            if (sessNames.has("working_dir")) {
                db.exec("UPDATE sessions SET cwd = working_dir WHERE cwd IS NULL AND working_dir IS NOT NULL");
            }
        }
        if (!sessNames.has("model")) {
            db.exec("ALTER TABLE sessions ADD COLUMN model TEXT");
        }
        if (!sessNames.has("ended_at")) {
            db.exec("ALTER TABLE sessions ADD COLUMN ended_at INTEGER");
        }
    }
    catch (err) {
        recordDbError(err);
    }
}
/** Return the shared SQLite database handle, opening it if needed. */
export function openDb() {
    return getDb();
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
        recordDbSuccess();
    }
    catch (err) {
        recordDbError(err);
    }
}
export function dbAppendMessage(sessionId, message) {
    try {
        const db = getDb();
        const content = typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content);
        db.prepare("INSERT INTO messages(session_id, role, content, ts) VALUES (?, ?, ?, ?)").run(sessionId, message.role, content, Date.now());
        recordDbSuccess();
    }
    catch (err) {
        recordDbError(err);
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