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
import { bootstrapIndex, ensureIndexStateTable, } from "./sync-index.js";
const _require = createRequire(import.meta.url);
const DB_DIR = join(homedir(), ".dirgha");
const DB_PATH = join(DB_DIR, "dirgha.db");
// Lazy singleton — only opened when first needed.
let _db = null;
let _watcher = null;
let _indexBootstrapped = false;
let _deferredDone = false;
let _vecInitError = null;
let _deferredResolve = null;
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
        // Phase 1 — fast path: schema + migration only. This is sub-100ms
        // even on a 61 MB database because SQLite only reads the header +
        // schema tables. The vec extension and bootstrap index are deferred
        // to phase 2 so the CLI can start rendering immediately.
        initSchema(db);
        migrateSchema(db);
        ensureIndexStateTable(db);
        // Phase 2 — deferred: vec extension + memory/knowledge indexing.
        // These can take 200-2000ms (vec native addon load + file walks).
        // We fire them in the background so the CLI remains responsive.
        process.nextTick(() => {
            try {
                const deferred = () => {
                    try {
                        loadVecExtension(db);
                    }
                    catch (err) {
                        _vecInitError = err instanceof Error ? err.message : String(err);
                    }
                    bootstrapIndexOnce(db);
                    _deferredDone = true;
                    if (_deferredResolve) {
                        _deferredResolve();
                        _deferredResolve = null;
                    }
                };
                // Defer by one microtask to let the caller (e.g. dbOpenSession)
                // finish its INSERT before we do potentially slow I/O.
                setImmediate(deferred);
            }
            catch {
                _deferredDone = true;
                if (_deferredResolve) {
                    _deferredResolve();
                    _deferredResolve = null;
                }
            }
        });
        return db;
    }
    catch {
        throw new Error(`SQLite unavailable (optional feature) — run "dirgha setup --features" to install.`);
    }
}
/**
 * First-call only: walk ~/.dirgha/memory and ~/.dirgha/knowledge into
 * `embedding_meta`, and (if chokidar is installed) attach a watcher.
 * Wrapped in a flag so re-entrant `openDb()` calls during startup don't
 * trigger a second sync. Failures are swallowed — the SQLite index is
 * a derived view and must never block CLI boot.
 */
function bootstrapIndexOnce(db) {
    if (_indexBootstrapped)
        return;
    _indexBootstrapped = true;
    try {
        const { watcher } = bootstrapIndex(db);
        _watcher = watcher;
    }
    catch (err) {
        recordDbError(err);
    }
}
/**
 * Stop the optional chokidar watcher and reset internal state. Used by
 * tests that need to swap out the home directory between runs.
 */
export async function _resetForTests() {
    if (_watcher) {
        try {
            await _watcher.close();
        }
        catch {
            /* swallow */
        }
        _watcher = null;
    }
    _indexBootstrapped = false;
    _db = null;
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

    -- embedding_meta table + index for vector search sidecar.
    -- The vec0 virtual table is created lazily in loadVecExtension.
    -- embedding_meta is always available so relational lookups work
    -- even when the vec native extension is absent.
    CREATE TABLE IF NOT EXISTS embedding_meta (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL,
      chunk TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_meta_source
      ON embedding_meta(source);

    -- v1.39 — session_snapshots accelerates session open by avoiding
    -- full JSONL replay. After compaction the agent loop writes a
    -- snapshot of the in-memory message array; on open we load the
    -- snapshot plus tail JSONL entries with ts > snapshot.ts.
    CREATE TABLE IF NOT EXISTS session_snapshots (
      session_id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
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
        // Ensure graph tables exist for DBs created before Sprint 3.
        db.exec(`
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
    `);
        // Migrate legacy graph_edges columns (from_id/to_id/type) -> (src/dst/rel).
        const edgeCols = db.pragma("table_info(graph_edges)");
        const edgeNames = new Set(edgeCols.map((c) => c.name));
        if (edgeNames.has("from_id") && !edgeNames.has("src")) {
            db.exec("ALTER TABLE graph_edges RENAME COLUMN from_id TO src");
        }
        if (edgeNames.has("to_id") && !edgeNames.has("dst")) {
            db.exec("ALTER TABLE graph_edges RENAME COLUMN to_id TO dst");
        }
        if (edgeNames.has("type") && !edgeNames.has("rel")) {
            db.exec("ALTER TABLE graph_edges RENAME COLUMN type TO rel");
        }
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_src ON graph_edges(src, rel);
      CREATE INDEX IF NOT EXISTS idx_edges_dst ON graph_edges(dst, rel);
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type);
    `);
        // v1.39 — session_snapshots, idempotent for existing DBs.
        db.exec(`
      CREATE TABLE IF NOT EXISTS session_snapshots (
        session_id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
    `);
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
        // Only specify id + started_at in the INSERT so column defaults
        // (model TEXT NOT NULL DEFAULT '', etc.) are used instead of NULL.
        // Older DB schemas may have NOT NULL on columns like `model` where
        // our current initSchema has nullable; passing NULL would cause
        // INSERT OR IGNORE to silently skip the row, breaking FK for messages.
        db.prepare("INSERT OR IGNORE INTO sessions(id, started_at) VALUES (?, ?)").run(id, Date.now());
        // If model or cwd were provided, update them after the row exists.
        if (model || cwd) {
            const sets = [];
            const vals = [];
            if (model) {
                sets.push("model = ?");
                vals.push(model);
            }
            if (cwd) {
                sets.push("cwd = ?");
                vals.push(cwd);
            }
            if (sets.length > 0) {
                db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
            }
        }
    }
    catch {
        /* never block the CLI */
    }
}
export function dbCloseSession(id) {
    try {
        const db = getDb();
        db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(Date.now(), id);
        db.pragma("wal_checkpoint(TRUNCATE)");
        recordDbSuccess();
    }
    catch (err) {
        recordDbError(err);
    }
}
export function dbAppendMessage(sessionId, message) {
    try {
        const db = getDb();
        // Ensure the session row exists before inserting a message.
        // dbOpenSession may not have completed yet due to async timing.
        // Only set id + started_at — other columns have defaults.
        db.prepare("INSERT OR IGNORE INTO sessions(id, started_at) VALUES (?, ?)").run(sessionId, Date.now());
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
export function dbCountSessionMessages(sessionId) {
    try {
        const db = getDb();
        const row = db.prepare('SELECT COUNT(*) as c FROM messages WHERE session_id = ?').get(sessionId);
        return row?.c ?? 0;
    }
    catch {
        return 0;
    }
}
export function dbReplaceSessionMessages(sessionId, messages) {
    try {
        const db = getDb();
        const tx = db.transaction((msgs) => {
            db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
            const stmt = db.prepare('INSERT INTO messages(session_id, role, content, ts) VALUES (?, ?, ?, ?)');
            const now = Date.now();
            for (const m of msgs) {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                stmt.run(sessionId, m.role, content, now);
            }
        });
        tx(messages);
        recordDbSuccess();
    }
    catch (err) {
        recordDbError(err);
    }
}
export function dbWriteSnapshot(sessionId, ts, messages) {
    try {
        const db = getDb();
        const payload = JSON.stringify(messages);
        db.prepare(`INSERT INTO session_snapshots(session_id, ts, message_count, payload)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         ts = excluded.ts,
         message_count = excluded.message_count,
         payload = excluded.payload`).run(sessionId, ts, messages.length, payload);
        recordDbSuccess();
    }
    catch (err) {
        recordDbError(err);
    }
}
export function dbReadSnapshot(sessionId) {
    try {
        const db = getDb();
        const row = db.prepare('SELECT ts, message_count, payload FROM session_snapshots WHERE session_id = ?').get(sessionId);
        if (!row)
            return null;
        let messages = [];
        try {
            messages = JSON.parse(row.payload);
        }
        catch {
            return null;
        }
        return { ts: row.ts, messageCount: row.message_count, messages };
    }
    catch {
        return null;
    }
}
export function dbDeleteSnapshot(sessionId) {
    try {
        const db = getDb();
        db.prepare('DELETE FROM session_snapshots WHERE session_id = ?').run(sessionId);
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
/**
 * Wait for deferred DB initialization (vec extension, bootstrap index) to
 * complete. Used by tests that need to assert on the post-phase-2 state.
 * Returns immediately if deferred init already finished.
 */
export function getVecInitError() {
    return _vecInitError;
}
export function waitForDeferredInit() {
    if (_deferredDone)
        return Promise.resolve();
    if (_db === null)
        return Promise.resolve();
    if (!_deferredResolve) {
        _deferredResolve = () => { };
    }
    return new Promise((resolve) => {
        const existing = _deferredResolve;
        _deferredResolve = () => {
            existing?.();
            resolve();
        };
        if (_deferredDone) {
            _deferredResolve();
        }
    });
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