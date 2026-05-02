/**
 * Live model-catalogue refresh.
 *
 * Calls each provider's OpenAI-compatible `<baseUrl>/models` endpoint
 * in parallel, captures the returned `data[].id` list, and persists a
 * cache at `~/.dirgha/models-cache.json` (mode 0600). The cache has a
 * TTL — `dirgha models list --fresh` forces a refetch, otherwise the
 * cached list is used until it's older than the TTL.
 *
 * The static `prices.ts` registry stays the source of truth for
 * pricing + context-window metadata. The cache only feeds back the
 * "what model ids are live RIGHT NOW" list so newly-added free-tier
 * models show up without a CLI version bump.
 *
 * Initial implementation seeded by a hy3 dogfood run.
 */
/// <reference types="node" resolution-mode="require"/>
export interface ResolvedProvider {
    name: string;
    baseUrl: string;
    models: string[];
    fetchedAt: string;
    error?: string;
}
export interface ModelsCache {
    fetchedAt: string;
    totalModels: number;
    providers: ResolvedProvider[];
}
export interface ProviderTarget {
    name: string;
    baseUrl: string;
    apiKey?: string | undefined;
}
/**
 * Fetch one provider's `/models` list. Always returns a result — never
 * throws — so a single broken provider can't break the others.
 */
export declare function fetchProviderModels(opts: {
    name: string;
    baseUrl: string;
    apiKey?: string | undefined;
    fetchImpl?: typeof fetch;
}): Promise<ResolvedProvider>;
/** Refresh every provider in parallel. Returns a cacheable snapshot. */
export declare function refreshAllModels(opts: {
    providers: ProviderTarget[];
    fetchImpl?: typeof fetch;
}): Promise<ModelsCache>;
export declare function readCache(cachePath: string): Promise<ModelsCache | null>;
export declare function writeCache(cachePath: string, data: ModelsCache): Promise<void>;
/** Cache is "fresh" if (now − cache.fetchedAt) ≤ ttlMs. */
export declare function isCacheFresh(cache: ModelsCache | null, ttlMs: number): boolean;
