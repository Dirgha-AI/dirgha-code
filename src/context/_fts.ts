/**
 * Optional SQLite FTS5 index, shared by memory and knowledge stores.
 *
 * This module is a thin best-effort wrapper around better-sqlite3's FTS5
 * virtual table. It never throws on the happy path: if the native binary
 * or FTS5 extension is unavailable, `openFtsIndex` returns `null` and
 * callers fall back to their naive substring scan.
 *
 * Keeping FTS logic in one place lets `memory.ts` and `knowledge.ts`
 * stay focused on their file-backed record contracts without each
 * growing its own sqlite boilerplate.
 */

import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// Minimal structural types for better-sqlite3 so we avoid a hard
// dependency on @types/better-sqlite3 (which is not always hoisted
// into the cli package's local `node_modules`).
interface BSStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  iterate(...params: unknown[]): IterableIterator<unknown>;
}

interface BSDatabase {
  exec(sql: string): BSDatabase;
  prepare(sql: string): BSStatement;
  pragma(sql: string): unknown;
  close(): void;
  readonly open: boolean;
}

interface BSDatabaseCtor {
  new (path: string, options?: { readonly?: boolean; fileMustExist?: boolean }): BSDatabase;
}

export interface FtsDoc {
  /** Primary key in the docs table. */
  id: string;
  /** Short title / headline. Indexed and returned in hits. */
  title: string;
  /** Main searchable body. Indexed but only snippets returned. */
  body: string;
  /** Optional comma-joined tag list. Indexed. */
  tags?: string;
}

export interface FtsHit {
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface FtsIndex {
  upsert(doc: FtsDoc): void;
  remove(id: string): void;
  search(query: string, limit: number): FtsHit[];
  close(): void;
}

export interface OpenFtsOptions {
  /** Absolute path to the sqlite file. Parent directory is auto-created. */
  dbPath: string;
  /** Table name prefix. Two tables are created: `${ns}_docs`, `${ns}_fts`. */
  namespace: string;
}

/**
 * Try to open (or create) an FTS5 index. Returns `null` if the native
 * binary or FTS5 virtual table cannot be initialised; callers should
 * treat `null` as "no index available, use naive search".
 */
export async function openFtsIndex(opts: OpenFtsOptions): Promise<FtsIndex | null> {
  const Ctor = loadBetterSqlite3();
  if (!Ctor) return null;

  await ensureDir(dirname(opts.dbPath));

  let db: BSDatabase;
  try {
    db = new Ctor(opts.dbPath);
    db.pragma('journal_mode = WAL');
  } catch {
    return null;
  }

  const docsTable = `${opts.namespace}_docs`;
  const ftsTable = `${opts.namespace}_fts`;

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${docsTable} (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL,
        tags       TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable}
        USING fts5(id UNINDEXED, title, body, tags, tokenize='porter unicode61');
    `);
  } catch {
    try { db.close(); } catch { /* ignore */ }
    return null;
  }

  const stmts = {
    deleteDoc: db.prepare(`DELETE FROM ${docsTable} WHERE id = ?`),
    deleteFts: db.prepare(`DELETE FROM ${ftsTable} WHERE id = ?`),
    insertDoc: db.prepare(
      `INSERT INTO ${docsTable}(id, title, body, tags, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         body  = excluded.body,
         tags  = excluded.tags,
         updated_at = excluded.updated_at`,
    ),
    insertFts: db.prepare(
      `INSERT INTO ${ftsTable}(id, title, body, tags) VALUES (?, ?, ?, ?)`,
    ),
    search: db.prepare(
      `SELECT id, title,
              snippet(${ftsTable}, 2, '[', ']', '…', 12) AS snippet,
              bm25(${ftsTable}) AS score
         FROM ${ftsTable}
        WHERE ${ftsTable} MATCH ?
        ORDER BY score
        LIMIT ?`,
    ),
  };

  const index: FtsIndex = {
    upsert(doc: FtsDoc): void {
      const tags = doc.tags ?? '';
      try {
        stmts.deleteFts.run(doc.id);
        stmts.insertDoc.run(doc.id, doc.title, doc.body, tags);
        stmts.insertFts.run(doc.id, doc.title, doc.body, tags);
      } catch { /* swallow — index is best-effort */ }
    },
    remove(id: string): void {
      try {
        stmts.deleteDoc.run(id);
        stmts.deleteFts.run(id);
      } catch { /* swallow */ }
    },
    search(query: string, limit: number): FtsHit[] {
      const safe = sanitizeFtsQuery(query);
      if (!safe) return [];
      let rows: unknown[];
      try {
        rows = stmts.search.all(safe, Math.max(1, limit));
      } catch {
        return [];
      }
      const hits: FtsHit[] = [];
      for (const row of rows) {
        const r = row as { id?: unknown; title?: unknown; snippet?: unknown; score?: unknown };
        if (typeof r.id !== 'string' || typeof r.title !== 'string') continue;
        hits.push({
          id: r.id,
          title: r.title,
          snippet: typeof r.snippet === 'string' ? r.snippet : '',
          score: typeof r.score === 'number' ? r.score : 0,
        });
      }
      return hits;
    },
    close(): void {
      try { db.close(); } catch { /* ignore */ }
    },
  };

  return index;
}

/**
 * Lazily resolve the better-sqlite3 constructor. Returns `null` when
 * the module is missing or the native binary fails to load (e.g. wrong
 * ABI) so callers can degrade gracefully instead of crashing.
 */
function loadBetterSqlite3(): BSDatabaseCtor | null {
  try {
    const req = createRequire(import.meta.url);
    const mod = req('better-sqlite3') as unknown;
    // CJS default export: module.exports = Database
    if (typeof mod === 'function') return mod as BSDatabaseCtor;
    if (mod && typeof (mod as { default?: unknown }).default === 'function') {
      return (mod as { default: BSDatabaseCtor }).default;
    }
    return null;
  } catch {
    return null;
  }
}

async function ensureDir(path: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);
  if (!info) await mkdir(path, { recursive: true });
}

/**
 * FTS5 MATCH queries reject most punctuation and raw apostrophes. We
 * strip everything that isn't a letter/digit/space and quote remaining
 * tokens. Empty output means "no useful query"; callers should bail.
 */
export function sanitizeFtsQuery(input: string): string {
  const cleaned = input
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2);
  if (cleaned.length === 0) return '';
  return cleaned.map(t => `"${t}"`).join(' OR ');
}

/**
 * Naive fallback: case-insensitive substring search with a coarse score.
 * Used when the FTS index cannot be opened.
 */
export function fallbackSearch<T extends { id: string; title: string; body: string; tags?: string }>(
  docs: T[],
  query: string,
  limit: number,
): FtsHit[] {
  const needle = query.toLowerCase().trim();
  if (!needle) return [];
  const hits: FtsHit[] = [];
  for (const doc of docs) {
    const hay = `${doc.title}\n${doc.tags ?? ''}\n${doc.body}`.toLowerCase();
    const idx = hay.indexOf(needle);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 24);
    const end = Math.min(hay.length, idx + needle.length + 24);
    // Scoring: earlier hits rank higher; title hits beat body hits.
    const score = (doc.title.toLowerCase().includes(needle) ? -10 : 0) + idx;
    hits.push({
      id: doc.id,
      title: doc.title,
      snippet: `${idx > 0 ? '…' : ''}${doc.body.slice(start, end)}…`,
      score,
    });
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, Math.max(1, limit));
}
