/**
 * Markdown → SQLite indexer (Sprint 6 — docs/cli/index/agent-db.md).
 *
 * Walks `~/.dirgha/memory/*.md` and `~/.dirgha/knowledge/*.md`, indexing
 * each file as a row in `embedding_meta` with source label
 * `memory:<slug>` or `kb:<slug>`. The SQLite copy is a derived index —
 * the markdown files on disk remain the source of truth.
 *
 * Skips files that haven't changed via an `index_state(source PK, mtime)`
 * sidecar table. `rm -rf ~/.dirgha/dirgha.db` and a restart rebuilds
 * cleanly because every markdown file looks "new" again.
 *
 * If chokidar is installed (optional dependency), watches the two
 * directories and propagates add/change/unlink within ~200ms. When
 * chokidar is absent, the startup-only sync is the entire mechanism.
 *
 * Public API:
 *   - syncMemoryAndKb(db, opts?) — one-shot walk + insert/update/delete
 *   - startWatchers(db, opts?)   — optional chokidar wiring (returns null if absent)
 *
 * Both APIs return summaries useful for `dirgha doctor` and tests.
 */
export interface SyncOptions {
    /** Override ~/.dirgha root for tests. Defaults to `homedir()/.dirgha`. */
    home?: string;
    /** Set to true to log skip/insert/update counts to stderr. */
    verbose?: boolean;
}
export interface SyncSummary {
    inserted: number;
    updated: number;
    unchanged: number;
    deleted: number;
    total: number;
    /** Most-recent file mtime (ms epoch) seen during this sync, or 0 when empty. */
    latestMtime: number;
}
export interface KbStats {
    count: number;
    latestSync: number;
}
/**
 * Bootstrap the `index_state` table used to skip-already-indexed files.
 * Idempotent — safe to call on every openDb().
 */
export declare function ensureIndexStateTable(db: import("better-sqlite3").Database): void;
/**
 * One-shot walk over ~/.dirgha/memory and ~/.dirgha/knowledge. Inserts
 * new files, refreshes changed ones, and removes rows for files no
 * longer on disk.
 */
export declare function syncMemoryAndKb(db: import("better-sqlite3").Database, opts?: SyncOptions): SyncSummary;
/**
 * Count of currently indexed memory + KB chunks, plus the most recent
 * sync timestamp. Used by `dirgha doctor`.
 */
export declare function getKbChunkStats(db: import("better-sqlite3").Database): KbStats;
export interface WatcherHandle {
    close(): Promise<void>;
}
/**
 * Optional file watcher. Returns null when chokidar is not installed —
 * callers should treat that as "startup-only sync, no live updates".
 */
export declare function startWatchers(db: import("better-sqlite3").Database, opts?: SyncOptions): WatcherHandle | null;
/**
 * Lazy startup hook — called from openDb() on first DB open per process.
 * Wraps syncMemoryAndKb + startWatchers in a try/catch so a transient
 * filesystem error never blocks the CLI from booting.
 */
export declare function bootstrapIndex(db: import("better-sqlite3").Database, opts?: SyncOptions): {
    summary: SyncSummary;
    watcher: WatcherHandle | null;
};
