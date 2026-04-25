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
//# sourceMappingURL=prices.js.map