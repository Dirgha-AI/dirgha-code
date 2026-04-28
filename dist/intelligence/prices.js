/**
 * Price catalogue. USD per million tokens. Update quarterly.
 * When a model is not listed, the cost tracker falls back to 0.
 */
// Refreshed 2026-04-25 against the live OpenRouter registry. Models that
// NVIDIA NIM does not serve are routed via OpenRouter so we don't lose
// breadth (Kimi K2.5/2.6, MiniMax M2/M2.7, DeepSeek R1/V3.1/V3.2, GLM
// 4.7/5, Qwen3 Coder/235B/VL, Tencent Hunyuan/HY3, Gemini 3 preview).
// Prices in USD per million tokens; OpenRouter prices reflect what OR
// charges (their margin is included).
export const PRICES = [
    // Anthropic — native API
    { provider: 'anthropic', model: 'claude-opus-4-7', inputPerM: 15, outputPerM: 75, cachedInputPerM: 1.5 },
    { provider: 'anthropic', model: 'claude-sonnet-4-6', inputPerM: 3, outputPerM: 15, cachedInputPerM: 0.3 },
    { provider: 'anthropic', model: 'claude-haiku-4-5', inputPerM: 0.8, outputPerM: 4, cachedInputPerM: 0.08 },
    // OpenAI — native API
    { provider: 'openai', model: 'gpt-5.5-pro', inputPerM: 30, outputPerM: 180 },
    { provider: 'openai', model: 'gpt-5.5', inputPerM: 5, outputPerM: 30 },
    { provider: 'openai', model: 'gpt-5', inputPerM: 10, outputPerM: 30 },
    { provider: 'openai', model: 'gpt-5-mini', inputPerM: 0.5, outputPerM: 2 },
    { provider: 'openai', model: 'gpt-4o-mini', inputPerM: 0.15, outputPerM: 0.6 },
    { provider: 'openai', model: 'o1', inputPerM: 15, outputPerM: 60 },
    // Google Gemini — native API (production-stable models)
    { provider: 'gemini', model: 'gemini-2.5-pro', inputPerM: 1.25, outputPerM: 5 },
    { provider: 'gemini', model: 'gemini-2.5-flash', inputPerM: 0.075, outputPerM: 0.3 },
    // NVIDIA NIM — verified live on the integrate.api.nvidia.com endpoint
    { provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-pro', inputPerM: 0, outputPerM: 0 },
    { provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-flash', inputPerM: 0, outputPerM: 0 },
    { provider: 'nvidia', model: 'moonshotai/kimi-k2-instruct', inputPerM: 0.15, outputPerM: 0.60 },
    { provider: 'nvidia', model: 'qwen/qwen3-next-80b-a3b-instruct', inputPerM: 0.08, outputPerM: 0.30 },
    { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct', inputPerM: 0.20, outputPerM: 0.80 },
    // OpenRouter — premium frontier (priced as OR charges)
    { provider: 'openrouter', model: 'openai/gpt-5.5-pro', inputPerM: 30, outputPerM: 180 },
    { provider: 'openrouter', model: 'openai/gpt-5.5', inputPerM: 5, outputPerM: 30 },
    { provider: 'openrouter', model: 'google/gemini-3.1-pro-preview', inputPerM: 2, outputPerM: 12 },
    { provider: 'openrouter', model: 'google/gemini-3-flash-preview', inputPerM: 0.5, outputPerM: 3 },
    // OpenRouter — Moonshot / Kimi
    { provider: 'openrouter', model: 'moonshotai/kimi-k2.6', inputPerM: 0.74, outputPerM: 4.66 },
    { provider: 'openrouter', model: 'moonshotai/kimi-k2.5', inputPerM: 0.44, outputPerM: 2 },
    { provider: 'openrouter', model: 'moonshotai/kimi-k2-thinking', inputPerM: 0.60, outputPerM: 2.50 },
    // OpenRouter — MiniMax
    { provider: 'openrouter', model: 'minimax/minimax-m2.7', inputPerM: 0.30, outputPerM: 1.20 },
    { provider: 'openrouter', model: 'minimax/minimax-m2', inputPerM: 0.26, outputPerM: 1 },
    // OpenRouter — DeepSeek
    { provider: 'openrouter', model: 'deepseek/deepseek-v3.2-exp', inputPerM: 0.27, outputPerM: 0.41 },
    { provider: 'openrouter', model: 'deepseek/deepseek-r1', inputPerM: 0.70, outputPerM: 2.50 },
    { provider: 'openrouter', model: 'deepseek/deepseek-chat-v3.1', inputPerM: 0.15, outputPerM: 0.75 },
    // OpenRouter — Qwen
    { provider: 'openrouter', model: 'qwen/qwen3-coder-plus', inputPerM: 0.65, outputPerM: 3.25 },
    { provider: 'openrouter', model: 'qwen/qwen3-235b-a22b-thinking-2507', inputPerM: 0.15, outputPerM: 1.50 },
    { provider: 'openrouter', model: 'qwen/qwen3-vl-235b-a22b-instruct', inputPerM: 0.20, outputPerM: 0.88 },
    // OpenRouter — Tencent
    { provider: 'openrouter', model: 'tencent/hunyuan-a13b-instruct', inputPerM: 0.14, outputPerM: 0.57 },
    // OpenRouter — Z.ai (GLM)
    { provider: 'openrouter', model: 'z-ai/glm-5.1', inputPerM: 1.05, outputPerM: 3.50 },
    { provider: 'openrouter', model: 'z-ai/glm-5-turbo', inputPerM: 1.20, outputPerM: 4 },
    { provider: 'openrouter', model: 'z-ai/glm-5', inputPerM: 0.60, outputPerM: 2.08 },
    { provider: 'openrouter', model: 'z-ai/glm-4.7', inputPerM: 0.38, outputPerM: 1.74 },
    { provider: 'openrouter', model: 'z-ai/glm-4.7-flash', inputPerM: 0.06, outputPerM: 0.40 },
    // OpenRouter — Free tier
    { provider: 'openrouter', model: 'inclusionai/ling-2.6-1t:free', inputPerM: 0, outputPerM: 0 },
    { provider: 'openrouter', model: 'tencent/hy3-preview:free', inputPerM: 0, outputPerM: 0 },
    { provider: 'openrouter', model: 'minimax/minimax-m2.5:free', inputPerM: 0, outputPerM: 0 },
    { provider: 'openrouter', model: 'qwen/qwen3-coder:free', inputPerM: 0, outputPerM: 0 },
    { provider: 'openrouter', model: 'z-ai/glm-4.5-air:free', inputPerM: 0, outputPerM: 0 },
];
export function findPrice(provider, model) {
    return PRICES.find(p => p.provider === provider && p.model === model);
}
/**
 * Single-source-of-truth lookup. Returns the full PricePoint for a
 * model id (provider-agnostic — model ids are unique across providers
 * in our catalogue). Pair with `contextWindowFor(id)` (which adds
 * a fallback default) when you only need the context limit.
 */
export function lookupModel(modelId) {
    return PRICES.find(p => p.model === modelId);
}
/**
 * All models grouped by their `family` field (or by inferred family
 * from the model id when unset). Powers the model picker + the
 * `dirgha models info` subcommand. Mutating the returned map does not
 * affect PRICES.
 */
export function modelsByFamily() {
    const out = new Map();
    for (const p of PRICES) {
        const family = p.family ?? inferFamily(p.model);
        if (!out.has(family))
            out.set(family, []);
        out.get(family).push(p);
    }
    return out;
}
function inferFamily(id) {
    if (/claude/.test(id))
        return 'claude';
    if (/^o[1-9]/.test(id) || /^gpt/.test(id) || /openai\//.test(id))
        return 'gpt';
    if (/gemini/.test(id) || /google\//.test(id))
        return 'gemini';
    if (/kimi/.test(id) || /moonshot/.test(id))
        return 'kimi';
    if (/minimax/.test(id))
        return 'minimax';
    if (/deepseek/.test(id))
        return 'deepseek';
    if (/qwen/.test(id))
        return 'qwen';
    if (/llama|meta\//.test(id))
        return 'llama';
    if (/glm/.test(id) || /z-ai/.test(id))
        return 'glm';
    if (/hunyuan/.test(id) || /tencent\//.test(id))
        return 'hunyuan';
    if (/ling/.test(id) || /inclusionai/.test(id))
        return 'ling';
    return 'other';
}
/**
 * Best-effort lookup of the context-window cap for a model id. Searches
 * across all providers since model ids in this catalogue are unique
 * enough to disambiguate. Returns undefined when the model is unknown
 * (caller should fall back to a conservative default like 32k).
 */
export function findContextWindow(modelId) {
    const hit = PRICES.find(p => p.model === modelId);
    return hit?.contextWindow;
}
/**
 * Per-model context-window catalogue. Numbers come from each provider's
 * published spec sheet (cross-checked against models.dev). When we add
 * a new model id to PRICES, also add its window here so context-aware
 * compaction has a real cap to compare against. Models not listed fall
 * back to DEFAULT_CONTEXT_WINDOW at runtime.
 */
export const DEFAULT_CONTEXT_WINDOW = 32_000;
const CONTEXT_WINDOWS = {
    // Anthropic
    'claude-opus-4-7': 200_000,
    'claude-sonnet-4-6': 200_000,
    'claude-haiku-4-5': 200_000,
    // OpenAI
    'gpt-5.5-pro': 400_000,
    'gpt-5.5': 400_000,
    'gpt-5': 400_000,
    'gpt-5-mini': 128_000,
    'gpt-4o-mini': 128_000,
    'o1': 200_000,
    // Gemini
    'gemini-2.5-pro': 2_000_000,
    'gemini-2.5-flash': 1_000_000,
    // NVIDIA NIM (verified live)
    'deepseek-ai/deepseek-v4-pro': 128_000,
    'deepseek-ai/deepseek-v4-flash': 128_000,
    'moonshotai/kimi-k2-instruct': 128_000,
    'qwen/qwen3-next-80b-a3b-instruct': 128_000,
    'meta/llama-3.3-70b-instruct': 128_000,
    // OpenRouter — frontier
    'openai/gpt-5.5-pro': 400_000,
    'openai/gpt-5.5': 400_000,
    'google/gemini-3.1-pro-preview': 2_000_000,
    'google/gemini-3-flash-preview': 1_000_000,
    // OpenRouter — Moonshot/Kimi
    'moonshotai/kimi-k2.6': 128_000,
    'moonshotai/kimi-k2.5': 128_000,
    'moonshotai/kimi-k2-thinking': 128_000,
    // OpenRouter — MiniMax
    'minimax/minimax-m2.7': 200_000,
    'minimax/minimax-m2': 200_000,
    // OpenRouter — DeepSeek
    'deepseek/deepseek-v3.2-exp': 128_000,
    'deepseek/deepseek-r1': 128_000,
    'deepseek/deepseek-chat-v3.1': 128_000,
    // OpenRouter — Qwen
    'qwen/qwen3-coder-plus': 256_000,
    'qwen/qwen3-235b-a22b-thinking-2507': 128_000,
    'qwen/qwen3-vl-235b-a22b-instruct': 128_000,
    // OpenRouter — Tencent
    'tencent/hunyuan-a13b-instruct': 32_000,
    // OpenRouter — Z.ai (GLM)
    'z-ai/glm-5.1': 128_000,
    'z-ai/glm-5-turbo': 128_000,
    'z-ai/glm-5': 128_000,
    'z-ai/glm-4.7': 128_000,
    'z-ai/glm-4.7-flash': 32_000,
    // OpenRouter — free
    'inclusionai/ling-2.6-1t:free': 32_000,
    'tencent/hy3-preview:free': 32_000,
    'minimax/minimax-m2.5:free': 200_000,
    'qwen/qwen3-coder:free': 32_000,
    'z-ai/glm-4.5-air:free': 128_000,
};
export function contextWindowFor(modelId) {
    return CONTEXT_WINDOWS[modelId] ?? findContextWindow(modelId) ?? DEFAULT_CONTEXT_WINDOW;
}
/**
 * Failover map: when the primary model is unavailable (provider 504,
 * timeout, rate-limit), callers swap to the fallback model id. We
 * pick OpenRouter equivalents for NIM-hosted models since OR has been
 * the most-stable upstream in our smoke tests, and same-family
 * fallbacks (Kimi → Kimi, DeepSeek → DeepSeek) so behavior stays
 * comparable.
 *
 * We use a model-substitution failover strategy that doesn't require
 * OAuth juggling — simpler than per-credential rotation.
 * `findFailover('x')` returns undefined when no good substitute is
 * known — caller surfaces the original error instead of retrying.
 */
const MODEL_FAILOVERS = {
    // NIM → OpenRouter mirror
    'moonshotai/kimi-k2-instruct': 'moonshotai/kimi-k2.5',
    'qwen/qwen3-next-80b-a3b-instruct': 'qwen/qwen3-235b-a22b-thinking-2507',
    'meta/llama-3.3-70b-instruct': 'qwen/qwen3-coder:free',
    'deepseek-ai/deepseek-v4-pro': 'deepseek/deepseek-v3.2-exp',
    'deepseek-ai/deepseek-v4-flash': 'deepseek/deepseek-chat-v3.1',
    // Anthropic-native → OpenRouter mirror (no key needed if OR set)
    'claude-opus-4-7': 'anthropic/claude-opus-4-7',
    'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
    'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
};
export function findFailover(modelId) {
    return MODEL_FAILOVERS[modelId];
}
/**
 * Short model aliases — let users type `dirgha -m kimi` instead of the
 * full canonical id. Lookup is case-insensitive and runs before any
 * provider routing, so the alias is invisible past resolveModelAlias.
 */
const MODEL_ALIASES = {
    // Anthropic
    opus: 'claude-opus-4-7',
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5',
    // OpenAI
    gpt5: 'gpt-5',
    'gpt-5': 'gpt-5',
    'gpt5-pro': 'gpt-5.5-pro',
    'gpt5-mini': 'gpt-5-mini',
    o1: 'o1',
    // Gemini
    gemini: 'gemini-2.5-pro',
    flash: 'gemini-2.5-flash',
    // NVIDIA NIM
    kimi: 'moonshotai/kimi-k2-instruct',
    qwen: 'qwen/qwen3-next-80b-a3b-instruct',
    llama: 'meta/llama-3.3-70b-instruct',
    deepseek: 'deepseek-ai/deepseek-v4-pro',
    'deepseek-pro': 'deepseek-ai/deepseek-v4-pro',
    'deepseek-flash': 'deepseek-ai/deepseek-v4-flash',
    // OpenRouter free tier
    ling: 'inclusionai/ling-2.6-1t:free',
    hy3: 'tencent/hy3-preview:free',
};
export function resolveModelAlias(input) {
    if (!input)
        return input;
    const key = input.toLowerCase().trim();
    return MODEL_ALIASES[key] ?? input;
}
export function listModelAliases() {
    return Object.entries(MODEL_ALIASES).map(([alias, model]) => ({ alias, model }));
}
//# sourceMappingURL=prices.js.map