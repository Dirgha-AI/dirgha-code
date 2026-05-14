/**
 * Fetches and caches the models.dev catalog of AI model providers and their models.
 *
 * Provides both async (getCatalogue) and synchronous (getContextWindowSync,
 * getMaxOutputSync) lookups. The sync map is built at module init from the
 * on-disk cache so contextWindowFor() never needs to be async.
 */
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// scope: S20

const cachePath = join(homedir(), '.dirgha', 'models-dev-cache.json');

export interface ModelsDevModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  cost: { inputPerM: number; outputPerM: number; cacheReadPerM?: number; cacheWritePerM?: number };
  capabilities: { tools: boolean; reasoning: boolean; attachments: boolean };
  modalities: { input: string[]; output: string[] };
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  apiBase: string | null;
  envKeys: string[];
  docUrl?: string;
  models: ModelsDevModel[];
}

export interface ModelsDevCatalog {
  fetchedAt: string;
  providerCount: number;
  modelCount: number;
  providers: Record<string, ModelsDevProvider>;
}

// ---------------------------------------------------------------------------
// Sync in-memory map — loaded once at module init from on-disk cache.
// Keys: bare modelId AND providerId/modelId for both exact and prefix lookup.
// Empty if cache file not found (new install). Warmed by populateSyncMap()
// after getCatalogue() resolves.
// ---------------------------------------------------------------------------
const _syncMap = new Map<string, { context: number; output: number }>();

function _buildSyncMap(catalog: ModelsDevCatalog): void {
  for (const [providerId, provider] of Object.entries(catalog.providers)) {
    for (const model of provider.models) {
      const entry = { context: model.contextWindow, output: model.maxOutput };
      _syncMap.set(model.id, entry);
      _syncMap.set(`${providerId}/${model.id}`, entry);
    }
  }
}

// Synchronous init from disk — never throws.
try {
  const raw = readFileSync(cachePath, 'utf-8');
  _buildSyncMap(JSON.parse(raw) as ModelsDevCatalog);
} catch {
  // Cache missing or invalid — map stays empty, falls back to prices.ts
}

/** Synchronous context window lookup. Returns undefined if model unknown. */
export function getContextWindowSync(modelId: string): number | undefined {
  const entry = _syncMap.get(modelId);
  if (entry) return entry.context;
  // Strip provider prefix: "deepseek-ai/deepseek-chat" → "deepseek-chat"
  const bareId = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  return _syncMap.get(bareId)?.context;
}

/** Synchronous max output lookup. Returns undefined if model unknown. */
export function getMaxOutputSync(modelId: string): number | undefined {
  const entry = _syncMap.get(modelId);
  if (entry) return entry.output;
  const bareId = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  return _syncMap.get(bareId)?.output;
}

/** Call after getCatalogue() resolves to keep the sync map warm. */
export function populateSyncMap(catalog: ModelsDevCatalog): void {
  _buildSyncMap(catalog);
}

// ---------------------------------------------------------------------------
// Async fetch / cache
// ---------------------------------------------------------------------------

export async function fetchModelsDev(timeoutMs?: number): Promise<ModelsDevCatalog> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const response = await fetch('https://models.dev/api.json', { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json() as Record<string, any>;
    const providers: Record<string, ModelsDevProvider> = {};
    let modelCount = 0;
    for (const [provId, provRaw] of Object.entries(raw)) {
      const p = provRaw as any;
      const modelsArr: ModelsDevModel[] = [];
      const modelsObj = (p.models && typeof p.models === 'object' && !Array.isArray(p.models)) ? p.models : {};
      for (const [modelId, modelRaw] of Object.entries(modelsObj)) {
        const m = modelRaw as any;
        const costRaw = m.cost || {};
        const limitRaw = m.limit || {};
        const modalitiesRaw = m.modalities || {};
        const model: ModelsDevModel = {
          id: modelId,
          name: m.name || modelId,
          contextWindow: limitRaw.context ?? 0,
          maxOutput: limitRaw.output ?? 0,
          cost: {
            inputPerM: costRaw.input ?? 0,
            outputPerM: costRaw.output ?? 0,
            ...(costRaw.cache_read !== undefined ? { cacheReadPerM: costRaw.cache_read } : {}),
            ...(costRaw.cache_write !== undefined ? { cacheWritePerM: costRaw.cache_write } : {}),
          },
          capabilities: {
            tools: m.tool_call ?? false,
            reasoning: m.reasoning ?? false,
            attachments: m.attachment ?? false,
          },
          modalities: {
            input: modalitiesRaw.input || [],
            output: modalitiesRaw.output || [],
          },
        };
        modelsArr.push(model);
      }
      providers[provId] = {
        id: provId,
        name: p.name || provId,
        apiBase: p.api ?? null,
        envKeys: Array.isArray(p.env) ? p.env : [],
        docUrl: p.doc || undefined,
        models: modelsArr,
      };
      modelCount += modelsArr.length;
    }
    return {
      fetchedAt: new Date().toISOString(),
      providerCount: Object.keys(providers).length,
      modelCount,
      providers,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readCache(): Promise<ModelsDevCatalog | null> {
  try {
    const data = await readFile(cachePath, 'utf8');
    return JSON.parse(data) as ModelsDevCatalog;
  } catch {
    return null;
  }
}

export async function writeCache(c: ModelsDevCatalog): Promise<void> {
  const dir = dirname(cachePath);
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(c), { mode: 0o600 });
}

export async function getCatalogue(ttlMs = 86400000): Promise<ModelsDevCatalog> {
  const cached = await readCache();
  if (cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < ttlMs) return cached;
  }
  try {
    const fresh = await fetchModelsDev();
    await writeCache(fresh);
    populateSyncMap(fresh);
    return fresh;
  } catch {
    if (cached) return cached;
    throw new Error("Failed to fetch model catalogue and no local cache available.");
  }
}
