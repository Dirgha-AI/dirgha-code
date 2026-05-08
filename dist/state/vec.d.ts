/**
 * sqlite-vec extension loader and vector schema migration.
 *
 * sqlite-vec is an optional native binding. On platforms where it
 * isn't available the CLI continues with FTS5 + relational search;
 * vector features are no-ops with a stderr warning.
 */
/**
 * Load the sqlite-vec extension into the open database handle.
 * On failure the CLI continues with vector features disabled.
 */
export declare function loadVecExtension(db: import("better-sqlite3").Database): void;
/**
 * Idempotent vector schema migration. Creates the embeddings virtual
 * table (vec0) and a sidecar embedding_meta table. If the vec extension
 * is absent, the virtual table step is skipped via savepoint — the meta
 * table and index are still created so relational lookups work.
 */
export declare function migrateVecSchema(db: import("better-sqlite3").Database): void;
/**
 * Returns true when sqlite-vec is loaded and vec_version() responds.
 * Used by `dirgha doctor` for the extension status line.
 */
export declare function isVecLoaded(db: import("better-sqlite3").Database): boolean;
/**
 * Return the loaded vec version string, or null when unavailable.
 */
export declare function vecVersion(db: import("better-sqlite3").Database): string | null;
