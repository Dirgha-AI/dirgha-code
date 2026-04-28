/**
 * Append-only ledger + living markdown digest.
 *
 * The agent's memory across sessions is two files — a JSONL ledger of
 * every decision/result (immutable, sortable, searchable) and a
 * markdown digest of what's been learned (mutable, model-readable).
 *
 *   ~/.dirgha/ledger/<scope>.jsonl    — append-only events
 *   ~/.dirgha/ledger/<scope>.md       — living digest, agent rewrites
 *
 * Together they make the agent restart-safe: a fresh agent reads the
 * digest for narrative context and tails the JSONL for recent state,
 * picks up where the previous session left off.
 *
 * Scopes are arbitrary strings — typical patterns:
 *   - "default"         — global cross-session memory
 *   - "<repo-name>"     — per-repo project context
 *   - "<task-id>"       — a specific long-running goal
 */
export type LedgerEntryKind = 'goal' | 'decision' | 'observation' | 'experiment' | 'metric' | 'note' | 'compaction';
export interface LedgerEntry {
    ts: string;
    kind: LedgerEntryKind;
    text: string;
    metadata?: Record<string, unknown>;
}
export interface LedgerScope {
    name: string;
    jsonlPath: string;
    digestPath: string;
}
export declare function ledgerScope(name: string, home?: string): LedgerScope;
export declare function appendLedger(scope: LedgerScope, entry: Omit<LedgerEntry, 'ts'>): Promise<void>;
export declare function readLedger(scope: LedgerScope, limit?: number): Promise<LedgerEntry[]>;
export declare function searchLedger(scope: LedgerScope, query: string): Promise<LedgerEntry[]>;
/**
 * TF-IDF cosine search over the ledger. Returns the top-K entries
 * ranked by relevance. When the query has no useful tokens, falls back
 * to substring search so callers don't get empty results from short
 * queries like "ok".
 */
export declare function searchLedgerRanked(scope: LedgerScope, query: string, opts?: {
    topK?: number;
}): Promise<Array<{
    entry: LedgerEntry;
    score: number;
}>>;
export declare function writeDigest(scope: LedgerScope, content: string): Promise<void>;
export declare function readDigest(scope: LedgerScope): Promise<string>;
/**
 * Render the ledger context for a fresh-agent boot. Combines the
 * digest (narrative summary) with a tail of the most recent N entries
 * (recent decisions / observations). Returns empty string when the
 * scope has no content.
 */
export declare function renderLedgerContext(scope: LedgerScope, opts?: {
    tailEntries?: number;
}): Promise<string>;
