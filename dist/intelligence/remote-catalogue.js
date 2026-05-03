/**
 * Live model catalogue sync.
 *
 * Fetches the live model catalogue from api.dirgha.ai on startup,
 * caches to disk (~/.dirgha/models-cache.json), refreshes every 6 hours.
 * Falls back to the hardcoded catalogues if the API is unreachable.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ANTHROPIC_CATALOGUE } from "../providers/anthropic-catalogue.js";
import { CEREBRAS_CATALOGUE } from "../providers/cerebras-catalogue.js";
import { COHERE_CATALOGUE } from "../providers/cohere-catalogue.js";
import { DEEPSEEK_CATALOGUE } from "../providers/deepseek-catalogue.js";
import { GEMINI_CATALOGUE } from "../providers/gemini-catalogue.js";
import { GROQ_CATALOGUE } from "../providers/groq-catalogue.js";
import { MISTRAL_CATALOGUE } from "../providers/mistral-catalogue.js";
import { NIM_CATALOGUE } from "../providers/nim-catalogue.js";
import { OPENAI_CATALOGUE } from "../providers/openai-catalogue.js";
import { PERPLEXITY_CATALOGUE } from "../providers/perplexity-catalogue.js";
import { TOGETHER_CATALOGUE } from "../providers/together-catalogue.js";
import { XAI_CATALOGUE } from "../providers/xai-catalogue.js";
const CACHE_PATH = join(homedir(), ".dirgha", "models-cache.json");
const REFRESH_MS = 6 * 60 * 60 * 1000;
function nimToRemote(m) {
    return {
        id: m.id,
        label: m.label,
        provider: "nvidia",
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        tools: m.tools,
        vision: m.vision,
        thinkingMode: m.thinkingMode,
        inputPerM: 0,
        outputPerM: 0,
        free: true,
        recommended: m.defaultModel ?? false,
        tags: m.tags,
    };
}
function descriptorToRemote(m, provider) {
    return {
        id: m.id,
        label: m.label,
        provider,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        tools: m.tools,
        vision: m.vision,
        thinkingMode: m.thinkingMode,
        inputPerM: m.inputPerM,
        outputPerM: m.outputPerM,
        cachedInputPerM: m.cachedInputPerM,
        free: m.inputPerM === 0 && m.outputPerM === 0,
        recommended: m.defaultModel ?? false,
        tags: m.tags,
    };
}
const PROVIDER_MAP = [
    { provider: "anthropic", catalogue: ANTHROPIC_CATALOGUE },
    { provider: "cerebras", catalogue: CEREBRAS_CATALOGUE },
    { provider: "cohere", catalogue: COHERE_CATALOGUE },
    { provider: "deepseek", catalogue: DEEPSEEK_CATALOGUE },
    { provider: "gemini", catalogue: GEMINI_CATALOGUE },
    { provider: "groq", catalogue: GROQ_CATALOGUE },
    { provider: "mistral", catalogue: MISTRAL_CATALOGUE },
    { provider: "openai", catalogue: OPENAI_CATALOGUE },
    { provider: "perplexity", catalogue: PERPLEXITY_CATALOGUE },
    { provider: "together", catalogue: TOGETHER_CATALOGUE },
    { provider: "xai", catalogue: XAI_CATALOGUE },
];
function buildLocalCatalogue() {
    const models = [];
    for (const m of NIM_CATALOGUE) {
        models.push(nimToRemote(m));
    }
    for (const { provider, catalogue } of PROVIDER_MAP) {
        for (const m of catalogue) {
            if (!m.deprecated) {
                models.push(descriptorToRemote(m, provider));
            }
        }
    }
    return models;
}
export async function fetchRemoteCatalogue() {
    try {
        const resp = await fetch("https://api.dirgha.ai/api/cli/models", {
            signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) {
            if (resp.status === 404) {
                return buildLocalCatalogue();
            }
            return buildLocalCatalogue();
        }
        const data = (await resp.json());
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
            return data.models;
        }
        return buildLocalCatalogue();
    }
    catch {
        return buildLocalCatalogue();
    }
}
export async function loadCatalogue() {
    try {
        const cached = await readCache(CACHE_PATH);
        if (cached && isCacheFresh(cached)) {
            return cached.models;
        }
    }
    catch {
        // proceed to fetch
    }
    try {
        const models = await fetchRemoteCatalogue();
        await writeCache(CACHE_PATH, {
            fetchedAt: new Date().toISOString(),
            provider: "api.dirgha.ai",
            models,
        });
        return models;
    }
    catch {
        return buildLocalCatalogue();
    }
}
export function getCachedCatalogue() {
    try {
        const raw = readFileSync(CACHE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.models))
            return parsed.models;
        return null;
    }
    catch {
        return null;
    }
}
function isCacheFresh(cache) {
    if (!cache || !cache.fetchedAt)
        return false;
    const t = Date.parse(cache.fetchedAt);
    if (Number.isNaN(t))
        return false;
    return Date.now() - t <= REFRESH_MS;
}
async function readCache(cachePath) {
    try {
        const raw = await readFile(cachePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.models))
            return parsed;
        return null;
    }
    catch {
        return null;
    }
}
async function writeCache(cachePath, data) {
    const dir = join(homedir(), ".dirgha");
    try {
        await mkdir(dir, { recursive: true });
    }
    catch {
        // directory exists
    }
    await writeFile(cachePath, JSON.stringify(data, null, 2), "utf8");
}
//# sourceMappingURL=remote-catalogue.js.map