/**
 * DeepSeek native provider — direct against api.deepseek.com.
 *
 * Why direct (vs routing via OpenRouter)?
 *   - Own quota, no shared free-tier 429s.
 *   - Native cache discount (~10% on hits) surfaces directly in usage.
 *   - Cheaper than OpenRouter for steady-state DeepSeek workloads.
 *
 * Wire protocol is OpenAI-compat, so we delegate to streamChatCompletions
 * the same way openai.ts and nvidia.ts do. Model IDs use the bare
 * `deepseek-chat` / `deepseek-reasoner` family — DeepSeek's own
 * canonical ids. Vendor-prefixed ids like `deepseek/deepseek-v4-flash`
 * (an OpenRouter routing slug) still go through the OR provider unless
 * the user explicitly forces DIRGHA_PROVIDER=deepseek.
 */
import { ProviderError } from "./iface.js";
import { streamChatCompletions } from "./openai-compat.js";
import { DEEPSEEK_CATALOGUE, DEEPSEEK_BY_ID, DEEPSEEK_MODEL_IDS } from "./deepseek-catalogue.js";
const DEFAULT_BASE = "https://api.deepseek.com/v1";
// Canonical model list derived from deepseek-catalogue.ts.
// Re-export for backward-compat with callers that imported DEEPSEEK_MODELS.
export const DEEPSEEK_MODELS = DEEPSEEK_CATALOGUE.map(m => ({ id: m.id, label: m.label }));
// DEEPSEEK_MODEL_IDS re-exported from catalogue for dispatch/routing use.
export { DEEPSEEK_MODEL_IDS };
export class DeepSeekProvider {
    id = "deepseek";
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(config = {}) {
        this.apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
        if (!this.apiKey)
            throw new ProviderError("DEEPSEEK_API_KEY is required", this.id);
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
        // Reasoning models can take 30–60 s on first-token. Match OpenRouter's
        // headroom so multi-turn coding sprints don't cancel themselves.
        this.timeoutMs = config.timeoutMs ?? 300_000;
    }
    supportsTools() {
        return true;
    }
    supportsThinking(modelId) {
        const base = modelId.replace(/^deepseek(?:-ai|-native)?\//, "");
        return (DEEPSEEK_BY_ID.get(base)?.thinkingMode ?? "none") !== "none";
    }
    stream(req) {
        const model = req.model.replace(/^deepseek(?:-ai|-native)?\//, "");
        return streamChatCompletions({
            providerName: this.id,
            endpoint: `${this.baseUrl}/chat/completions`,
            apiKey: this.apiKey,
            model,
            messages: req.messages,
            tools: this.supportsTools() ? req.tools : undefined,
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            timeoutMs: this.timeoutMs,
            signal: req.signal,
            includeThinking: this.supportsThinking(req.model) && req.thinking !== "off",
        });
    }
}
//# sourceMappingURL=deepseek.js.map