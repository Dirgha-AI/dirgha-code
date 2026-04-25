/**
 * Multi-key BYOK pool — multiple credentials per provider with
 * priority + cooldown so a 429'd free-tier key cycles out and a
 * higher-priority paid key takes over without restarting the CLI.
 *
 * Each provider can hold N credentials with labels + priority. The
 * runtime picks the highest-priority entry that hasn't been marked
 * exhausted (e.g. by a 429 from a free-tier quota). When all entries
 * are exhausted the pool falls back to env vars.
 *
 * Storage: `~/.dirgha/keypool.json` (mode 0600).
 *
 * Schema:
 *   {
 *     "OPENROUTER_API_KEY": [
 *       { "id": "<hex>", "value": "...", "label": "primary", "priority": 0,
 *         "addedAt": "2026-04-25T...", "lastUsedAt": null,
 *         "exhaustedUntil": null }
 *     ]
 *   }
 *
 * Concurrent writes are serialised by a sibling lock file
 * `~/.dirgha/keypool.json.lock`. Stale locks (older than 30 s) are
 * stolen so a crashed CLI can't wedge the file forever.
 */
export interface PoolEntry {
    id: string;
    value: string;
    label: string;
    priority: number;
    addedAt: string;
    lastUsedAt: string | null;
    exhaustedUntil: string | null;
}
export type Pool = Record<string, PoolEntry[]>;
export declare function poolPath(home?: string): string;
export declare function readPool(home?: string): Promise<Pool>;
export declare function addEntry(envName: string, value: string, opts?: {
    label?: string;
    priority?: number;
    home?: string;
}): Promise<PoolEntry>;
export declare function removeEntry(envName: string, id: string, home?: string): Promise<boolean>;
export declare function clearProvider(envName: string, home?: string): Promise<number>;
/**
 * Pick the highest-priority non-exhausted entry for a provider env name.
 * Returns undefined when no entry is usable; caller falls back to
 * process.env or the legacy single-key store.
 */
export declare function pickEntry(pool: Pool, envName: string, now?: Date): PoolEntry | undefined;
/** Mark an entry exhausted until a wall-clock time (for 429 rate limits). */
export declare function markExhausted(envName: string, id: string, untilIso: string, home?: string): Promise<void>;
/** Stamp an entry's lastUsedAt to "now" (best-effort, never throws). */
export declare function touchEntry(envName: string, id: string, home?: string): Promise<void>;
/**
 * Hydrate process.env from the pool. For each env name with at least
 * one usable entry, the highest-priority entry's value is exported
 * (only if env is currently unset — shell still wins). Returns the
 * list of names hydrated, mirroring keystore.ts so callers can swap
 * implementations.
 */
export declare function hydrateEnvFromPool(env?: NodeJS.ProcessEnv, home?: string): Promise<string[]>;
