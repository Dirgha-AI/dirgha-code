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

import { readFile, writeFile, chmod } from 'node:fs/promises';

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

const DEFAULT_FETCH: typeof fetch | undefined = globalThis.fetch?.bind(globalThis);

/**
 * Fetch one provider's `/models` list. Always returns a result — never
 * throws — so a single broken provider can't break the others.
 */
export async function fetchProviderModels(opts: {
  name: string;
  baseUrl: string;
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedProvider> {
  const { name, baseUrl, apiKey, fetchImpl = DEFAULT_FETCH } = opts;
  const fetchedAt = new Date().toISOString();
  if (!fetchImpl) return { name, baseUrl, models: [], fetchedAt, error: 'no fetch implementation available' };
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const resp = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/models`, { headers });
    if (!resp.ok) return { name, baseUrl, models: [], fetchedAt, error: `HTTP ${resp.status}` };
    const json = await resp.json() as { data?: Array<{ id?: string }> };
    const models = Array.isArray(json.data)
      ? json.data.map(m => m.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    return { name, baseUrl, models, fetchedAt };
  } catch (err) {
    return { name, baseUrl, models: [], fetchedAt, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Refresh every provider in parallel. Returns a cacheable snapshot. */
export async function refreshAllModels(opts: {
  providers: ProviderTarget[];
  fetchImpl?: typeof fetch;
}): Promise<ModelsCache> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(
    opts.providers.map(p => fetchProviderModels({ ...p, ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) })),
  );
  const totalModels = results.reduce((sum, r) => sum + r.models.length, 0);
  return { fetchedAt, totalModels, providers: results };
}

export async function readCache(cachePath: string): Promise<ModelsCache | null> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as ModelsCache;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.providers)) return parsed;
    return null;
  } catch { return null; }
}

export async function writeCache(cachePath: string, data: ModelsCache): Promise<void> {
  await writeFile(cachePath, JSON.stringify(data, null, 2), 'utf8');
  if (process.platform !== 'win32') {
    try { await chmod(cachePath, 0o600); } catch { /* non-POSIX */ }
  }
}

/** Cache is "fresh" if (now − cache.fetchedAt) ≤ ttlMs. */
export function isCacheFresh(cache: ModelsCache | null, ttlMs: number): boolean {
  if (!cache || !cache.fetchedAt) return false;
  const t = Date.parse(cache.fetchedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= ttlMs;
}
