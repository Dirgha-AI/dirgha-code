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
import type { Message } from "../kernel/types.js";
import { recordDbError, recordDbSuccess } from "./db-telemetry.js";
import { loadVecExtension } from "./vec.js";
import {
  bootstrapIndex,
  ensureIndexStateTable,
  type WatcherHandle,
} from "./sync-index.js";

const _require = createRequire(import.meta.url);

const DB_DIR = join(homedir(), ".dirgha");
const DB_PATH = join(DB_DIR, "dirgha.db");

// Lazy singleton — only opened when first needed.
let _db: import("better-sqlite3").Database | null = null;
let _watcher: WatcherHandle | null = null;
let _indexBootstrapped = false;

function getDb(): import("better-sqlite3").Database {
  if (_db) return _db;

  try {
    const Database =
      _require("better-sqlite3") as typeof import("better-sqlite3");
    mkdirSync(DB_DIR, { recursive: true });
    _db = new (Database as unknown as new (
      path: string,
      opts?: { wal?: boolean },
    ) => import("better-sqlite3").Database)(DB_PATH);
    (_db as import("better-sqlite3").Database).pragma("journal_mode = WAL");
    (_db as import("better-sqlite3").Database).pragma("synchronous = NORMAL");
    const db = _db as import("better-sqlite3").Database;
    initSchema(db);
    migrateSchema(db);
    loadVecExtension(db);
    ensureIndexStateTable(db);
    bootstrapIndexOnce(db);
    return db;
  } catch {
    throw new Error(
      `SQLite unavailable (optional feature) — run "dirgha setup --features" to install.`,
    );
  }
}

/**
 * First-call only: walk ~/.dirgha/memory and ~/.dirgha/knowledge into
 * `embedding_meta`, and (if chokidar is installed) attach a watcher.
 * Wrapped in a flag so re-entrant `openDb()` calls during startup don't
 * trigger a second sync. Failures are swallowed — the SQLite index is
 * a derived view and must never block CLI boot.
 */
function bootstrapIndexOnce(db: import("better-sqlite3").Database): void {
  if (_indexBootstrapped) return;
  _indexBootstrapped = true;
  try {
    const { watcher } = bootstrapIndex(db);
    _watcher = watcher;
  } catch (err) {
    recordDbError(err);
  }
}

/**
 * Stop the optional chokidar watcher and reset internal state. Used by
 * tests that need to swap out the home directory between runs.
 */
export async function _resetForTests(): Promise<void> {
  if (_watcher) {
    try {
      await _watcher.close();
    } catch {
      /* swallow */
    }
    _watcher = null;
  }
  _indexBootstrapped = false;
  _db = null;
}

function initSchema(db: import("better-sqlite3").Database): void {
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

    -- Sprint 3 graph schema (docs/cli/index/agent-db.md).
    -- graph_nodes + graph_edges with directed labelled edges.
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id    TEXT PRIMARY KEY,
      type  TEXT NOT NULL,
      props TEXT,
      ts    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS graph_edges (
      src   TEXT NOT NULL,
      dst   TEXT NOT NULL,
      rel   TEXT NOT NULL,
      props TEXT,
      ts    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (src, dst, rel),
      FOREIGN KEY (src) REFERENCES graph_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (dst) REFERENCES graph_nodes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_edges_src ON graph_edges(src, rel);
    CREATE INDEX IF NOT EXISTS idx_edges_dst ON graph_edges(dst, rel);
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type);
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
function migrateSchema(db: import("better-sqlite3").Database): void {
  try {
    // messages: add ts if it doesn't exist
    const msgCols = db.pragma("table_info(messages)") as Array<{
      name: string;
    }>;
    const hasTs = msgCols.some((c) => c.name === "ts");
    const hasCreatedAt = msgCols.some((c) => c.name === "created_at");

    if (!hasTs) {
      db.exec(
        "ALTER TABLE messages ADD COLUMN ts INTEGER NOT NULL DEFAULT 0",
      );
    }

    if (hasCreatedAt) {
      // Backfill ts from legacy text timestamp (once, for rows still at 0).
      db.exec(
        "UPDATE messages SET ts = CAST(strftime('%s', created_at) * 1000 AS INTEGER) WHERE ts = 0 AND created_at IS NOT NULL",
      );
    }

    // sessions: align legacy schemas (some predate the current column set).
    // Earlier CLI versions wrote sessions(id, title, model, tokens,
    // created_at, updated_at, working_dir, ...) — but dbOpenSession's
    // INSERT lists `cwd` and `started_at`. Add any missing columns.
    const sessCols = db.pragma("table_info(sessions)") as Array<{
      name: string;
    }>;
    const sessNames = new Set(sessCols.map((c) => c.name));

    if (!sessNames.has("started_at")) {
      db.exec(
        "ALTER TABLE sessions ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!sessNames.has("cwd")) {
      // Default to '' so the NOT-NULL semantics aren't a problem; if the
      // legacy column `working_dir` exists, copy it across as a one-shot.
      db.exec("ALTER TABLE sessions ADD COLUMN cwd TEXT");
      if (sessNames.has("working_dir")) {
        db.exec(
          "UPDATE sessions SET cwd = working_dir WHERE cwd IS NULL AND working_dir IS NOT NULL",
        );
      }
    }
    if (!sessNames.has("model")) {
      db.exec("ALTER TABLE sessions ADD COLUMN model TEXT");
    }
    if (!sessNames.has("ended_at")) {
      db.exec("ALTER TABLE sessions ADD COLUMN ended_at INTEGER");
    }
  } catch (err) {
    recordDbError(err);
  }
}

/** Return the shared SQLite database handle, opening it if needed. */
export function openDb(): import("better-sqlite3").Database {
  return getDb();
}

export function dbOpenSession(id: string, model?: string, cwd?: string): void {
  try {
    const db = getDb();
    db.prepare(
      "INSERT OR IGNORE INTO sessions(id, model, cwd, started_at) VALUES (?, ?, ?, ?)",
    ).run(id, model ?? null, cwd ?? null, Date.now());
  } catch {
    /* never block the CLI */
  }
}

export function dbCloseSession(id: string): void {
  try {
    const db = getDb();
    db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(
      Date.now(),
      id,
    );
    recordDbSuccess();
  } catch (err) {
    recordDbError(err);
  }
}

export function dbAppendMessage(sessionId: string, message: Message): void {
  try {
    const db = getDb();
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    db.prepare(
      "INSERT INTO messages(session_id, role, content, ts) VALUES (?, ?, ?, ?)",
    ).run(sessionId, message.role, content, Date.now());
    recordDbSuccess();
  } catch (err) {
    recordDbError(err);
  }
}

export interface ChatResult {
  sessionId: string;
  role: string;
  content: string;
  ts: number;
}

export function dbSearchChats(query: string, limit = 20): ChatResult[] {
  try {
    const db = getDb();
    return db
      .prepare(
        `
      SELECT m.session_id as sessionId, m.role, m.content, m.ts
      FROM messages_fts f
      JOIN messages m ON m.id = f.rowid
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `,
      )
      .all(query, limit) as ChatResult[];
  } catch {
    return [];
  }
}

export function isSqliteAvailable(): boolean {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}

export function dbListSessions(limit = 20): Array<{
  id: string;
  model: string | null;
  started_at: number;
  ended_at: number | null;
  messageCount: number;
}> {
  try {
    const db = getDb();
    return db
      .prepare(
        `
      SELECT s.id, s.model, s.started_at, s.ended_at,
             COUNT(m.id) as messageCount
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT ?
    `,
      )
      .all(limit) as Array<{
      id: string;
      model: string | null;
      started_at: number;
      ended_at: number | null;
      messageCount: number;
    }>;
  } catch {
    return [];
  }
}
