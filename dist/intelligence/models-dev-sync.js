/**
 * Fetches and caches the models.dev catalog of AI model providers and their models.
 */
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
// scope: S20
const cachePath = join(homedir(), '.dirgha', 'models-dev-cache.json');
export async function fetchModelsDev(timeoutMs) {
    const controller = new AbortController();
    let timer;
    if (timeoutMs !== undefined) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    try {
        const response = await fetch('https://models.dev/api.json', { signal: controller.signal });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();
        const providers = {};
        let modelCount = 0;
        for (const [provId, provRaw] of Object.entries(raw)) {
            const p = provRaw;
            const modelsArr = [];
            const modelsObj = (p.models && typeof p.models === 'object' && !Array.isArray(p.models)) ? p.models : {};
            for (const [modelId, modelRaw] of Object.entries(modelsObj)) {
                const m = modelRaw;
                const costRaw = m.cost || {};
                const limitRaw = m.limit || {};
                const modalitiesRaw = m.modalities || {};
                const model = {
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
            const provider = {
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
        const catalog = {
            fetchedAt: new Date().toISOString(),
            providerCount: Object.keys(providers).length,
            modelCount,
            providers,
        };
        return catalog;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
export async function readCache() {
    try {
        const data = await readFile(cachePath, 'utf8');
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export async function writeCache(c) {
    const dir = dirname(cachePath);
    await mkdir(dir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(c), { mode: 0o600 });
}
export async function getCatalogue(ttlMs = 86400000) {
    const cached = await readCache();
    if (cached) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (age < ttlMs)
            return cached;
    }
    try {
        const fresh = await fetchModelsDev();
        await writeCache(fresh);
        return fresh;
    }
    catch {
        if (cached)
            return cached;
        throw new Error("Failed to fetch model catalogue and no local cache available.");
    }
}
//# sourceMappingURL=models-dev-sync.js.map