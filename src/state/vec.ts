/**
 * sqlite-vec extension loader and vector schema migration.
 *
 * sqlite-vec is an optional native binding. On platforms where it
 * isn't available the CLI continues with FTS5 + relational search;
 * vector features are no-ops with a stderr warning.
 */

import { createRequire } from "node:module";
import { recordDbError } from "./db-telemetry.js";

const _require = createRequire(import.meta.url);

let _sqliteVec: typeof import("sqlite-vec") | null = null;
try {
  _sqliteVec = _require("sqlite-vec");
} catch {
  /* optional dependency not installed on this platform */
}

/**
 * Load the sqlite-vec extension into the open database handle.
 * On failure the CLI continues with vector features disabled.
 */
export function loadVecExtension(
  db: import("better-sqlite3").Database,
): void {
  if (!_sqliteVec) return;

  try {
    _sqliteVec.load(db);

    try {
      const row = db
        .prepare("SELECT vec_version() AS version")
        .get() as { version?: string };
      if (row?.version) {
        process.stderr.write(`[Dirgha] sqlite-vec v${row.version} loaded\n`);
      }
    } catch {
      /* extension loaded but version probe failed — unusual, non-fatal */
    }

    migrateVecSchema(db);
  } catch (err) {
    process.stderr.write(
      `[Dirgha] sqlite-vec extension failed to load (vector search disabled): ${(err as Error).message}\n`,
    );
  }
}

/**
 * Idempotent vector schema migration. Creates the embeddings virtual
 * table (vec0) and a sidecar embedding_meta table. If the vec extension
 * is absent, the virtual table step is skipped via savepoint — the meta
 * table and index are still created so relational lookups work.
 */
export function migrateVecSchema(
  db: import("better-sqlite3").Database,
): void {
  try {
    // embedding_meta + index are always safe (no extension required).
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        chunk TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_embedding_meta_source
        ON embedding_meta(source);
    `);

    // Virtual table wrapped in savepoint for graceful fallback when vec
    // is absent. If vec0 module is not loaded, rollback and log; meta
    // table survives.
    db.exec("SAVEPOINT vec_migration");
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
          embedding float[384]
        );
      `);
      db.exec("RELEASE vec_migration");
    } catch (err) {
      db.exec("ROLLBACK TO vec_migration");
      process.stderr.write(
        `[Dirgha] vec virtual table creation failed (vector search disabled): ${(err as Error).message}\n`,
      );
    }
  } catch (err) {
    recordDbError(err);
  }
}

/**
 * Returns true when sqlite-vec is loaded and vec_version() responds.
 * Used by `dirgha doctor` for the extension status line.
 */
export function isVecLoaded(
  db: import("better-sqlite3").Database,
): boolean {
  try {
    const row = db
      .prepare("SELECT vec_version() AS version")
      .get() as { version?: string } | undefined;
    return Boolean(row?.version);
  } catch {
    return false;
  }
}

/**
 * Return the loaded vec version string, or null when unavailable.
 */
export function vecVersion(
  db: import("better-sqlite3").Database,
): string | null {
  try {
    const row = db
      .prepare("SELECT vec_version() AS version")
      .get() as { version?: string } | undefined;
    return row?.version ?? null;
  } catch {
    return null;
  }
}
