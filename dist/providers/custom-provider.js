import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { streamChatCompletions } from "./openai-compat.js";
/** Runtime provider that talks to any OpenAI‑compatible server */
export class CustomProvider {
    id;
    entry;
    constructor(entry) {
        this.entry = entry;
        this.id = entry.id;
    }
    supportsTools() {
        return this.entry.supportsTools ?? true;
    }
    supportsThinking() {
        return this.entry.supportsThinking ?? false;
    }
    async *stream(req) {
        // Escape regex metacharacters in the provider id to avoid injection
        const escapedId = this.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const model = req.model.replace(new RegExp(`^${escapedId}/`), "");
        // Build a safe environment variable name (replace non-alphanumeric with underscore)
        const safeId = this.entry.id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const apiKey = this.entry.apiKey ??
            process.env[`CUSTOM_${safeId}_API_KEY`] ??
            "";
        const endpoint = `${this.entry.baseUrl.replace(/\/+$/, "")}/chat/completions`;
        const timeoutMs = this.entry.timeoutMs ?? 90_000;
        const stallTimeoutMs = this.entry.stallTimeoutMs ?? 90_000;
        yield* streamChatCompletions({
            providerName: this.id,
            endpoint,
            apiKey,
            model,
            messages: req.messages,
            tools: this.supportsTools() ? req.tools : undefined,
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            signal: req.signal,
            timeoutMs,
            stallTimeoutMs,
            includeThinking: this.supportsThinking(),
        });
    }
}
/**
 * Read the user‑level providers file and instantiate a map of
 * CustomProvider objects.  Failures (file missing, parse error, …)
 * are silently swallowed – an empty Map is returned.
 */
export function loadCustomProviders() {
    const path = join(homedir(), ".dirgha", "providers.json");
    try {
        const raw = readFileSync(path, { encoding: "utf-8" });
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries))
            return new Map();
        const map = new Map();
        for (const entry of entries) {
            if (entry.id)
                map.set(entry.id, new CustomProvider(entry));
        }
        return map;
    }
    catch {
        return new Map();
    }
}
/** Singleton provider map, populated once at module load */
export const CUSTOM_PROVIDERS = loadCustomProviders();
//# sourceMappingURL=custom-provider.js.map