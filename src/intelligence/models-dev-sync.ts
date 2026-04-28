/**
 * Fetches and caches the models.dev catalog of AI model providers and their models.
 */
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

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
      const provider: ModelsDevProvider = {
        id: provId,
        name: p.name || provId,
        apiBase: p.api ?? null,
        envKeys: Array.isArray(p.env) ? p.env : [],
        docUrl: p.doc || undefined,
        models: modelsArr,
      };
      providers[provId] = provider;
      modelCount += modelsArr.length;
    }
    const catalog: ModelsDevCatalog = {
      fetchedAt: new Date().toISOString(),
      providerCount: Object.keys(providers).length,
      modelCount,
      providers,
    };
    return catalog;
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
  const fresh = await fetchModelsDev();
  await writeCache(fresh);
  return fresh;
}