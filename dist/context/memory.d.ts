/**
 * Long-term memory store. File-backed, one directory per user.
 *
 * Two public APIs, both live on the same underlying store:
 *
 *   1. The original `MemoryStore` (list/get/upsert/remove/search) —
 *      structured records with type/name/description/body. Kept
 *      verbatim for backwards compatibility.
 *
 *   2. The canonical L3 context contract `KeyedMemoryStore`
 *      (save/load/search/list/delete) — key-addressed markdown notes
 *      with frontmatter tags. This is what the agent loop, CLI
 *      `memory` commands, and the `memory` tool all use going forward.
 *
 * Both APIs share the same on-disk layout: `~/.dirgha/memory/{key}.md`
 * with YAML frontmatter. An optional SQLite FTS5 index at
 * `~/.dirgha/memory/index.db` accelerates `search` when better-sqlite3
 * is available; if not, we fall back to a substring scan.
 */
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';
export interface MemoryEntry {
    id: string;
    type: MemoryType;
    name: string;
    description: string;
    body: string;
    createdAt: string;
    updatedAt: string;
}
export interface MemoryStore {
    list(): Promise<MemoryEntry[]>;
    get(id: string): Promise<MemoryEntry | undefined>;
    upsert(entry: MemoryEntry): Promise<void>;
    remove(id: string): Promise<void>;
    search(query: string): Promise<MemoryEntry[]>;
}
export interface MemoryHit {
    key: string;
    title: string;
    snippet: string;
    score: number;
}
export interface KeyedMemoryStore {
    save(key: string, value: string, tags?: string[]): Promise<void>;
    load(key: string): Promise<string | null>;
    search(query: string, limit?: number): Promise<MemoryHit[]>;
    list(): Promise<string[]>;
    delete(key: string): Promise<void>;
}
export interface FileMemoryStoreOptions {
    directory?: string;
    /** Set to false to skip opening the FTS5 index (tests, read-only envs). */
    useFtsIndex?: boolean;
}
/** Legacy factory — returns the structured-record API used by existing callers. */
export declare function createMemoryStore(opts?: FileMemoryStoreOptions): MemoryStore;
/**
 * Canonical L3 factory — returns the key/value API described in the
 * experience spec. Both factories wrap the same on-disk store, so
 * callers may create either view safely.
 */
export declare function createKeyedMemoryStore(opts?: FileMemoryStoreOptions): KeyedMemoryStore;
export declare class FileMemoryStore implements MemoryStore {
    readonly dir: string;
    readonly ftsEnabled: boolean;
    private ftsPromise;
    constructor(dir: string, ftsEnabled: boolean);
    list(): Promise<MemoryEntry[]>;
    get(id: string): Promise<MemoryEntry | undefined>;
    upsert(entry: MemoryEntry): Promise<void>;
    remove(id: string): Promise<void>;
    search(query: string): Promise<MemoryEntry[]>;
    /** Ranked hit search used by `KeyedMemoryStore.search`. */
    searchHits(query: string, limit: number): Promise<MemoryHit[]>;
    private pathFor;
    private ensure;
    private writeIndex;
    private fts;
    private reindex;
}
