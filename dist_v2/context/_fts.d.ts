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
export declare function openFtsIndex(opts: OpenFtsOptions): Promise<FtsIndex | null>;
/**
 * FTS5 MATCH queries reject most punctuation and raw apostrophes. We
 * strip everything that isn't a letter/digit/space and quote remaining
 * tokens. Empty output means "no useful query"; callers should bail.
 */
export declare function sanitizeFtsQuery(input: string): string;
/**
 * Naive fallback: case-insensitive substring search with a coarse score.
 * Used when the FTS index cannot be opened.
 */
export declare function fallbackSearch<T extends {
    id: string;
    title: string;
    body: string;
    tags?: string;
}>(docs: T[], query: string, limit: number): FtsHit[];
