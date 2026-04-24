/**
 * Price catalogue. USD per million tokens. Update quarterly.
 * When a model is not listed, the cost tracker falls back to 0.
 */
// Kept in sync with apps/agent-os/src/lib/models.ts (2026-04-24 refresh).
// Only lists models verified live on prod. Removed Kimi K2.5 Turbo, Qwen Coder/235B,
// MiniMax M2/M2.7, DeepSeek V3.1/R1, GLM 5.1 — NIM returns 404/410 for these.
export const PRICES = [
    { provider: 'anthropic', model: 'claude-opus-4-7', inputPerM: 15, outputPerM: 75, cachedInputPerM: 1.5 },
    { provider: 'anthropic', model: 'claude-sonnet-4-6', inputPerM: 3, outputPerM: 15, cachedInputPerM: 0.3 },
    { provider: 'anthropic', model: 'claude-haiku-4-5', inputPerM: 0.8, outputPerM: 4, cachedInputPerM: 0.08 },
    { provider: 'openai', model: 'gpt-5', inputPerM: 10, outputPerM: 30 },
    { provider: 'openai', model: 'gpt-5-mini', inputPerM: 0.5, outputPerM: 2 },
    { provider: 'openai', model: 'gpt-4o-mini', inputPerM: 0.15, outputPerM: 0.6 },
    { provider: 'openai', model: 'o1', inputPerM: 15, outputPerM: 60 },
    { provider: 'gemini', model: 'gemini-2.5-pro', inputPerM: 1.25, outputPerM: 5 },
    { provider: 'gemini', model: 'gemini-2.5-flash', inputPerM: 0.075, outputPerM: 0.3 },
    { provider: 'nvidia', model: 'moonshotai/kimi-k2-instruct', inputPerM: 0.15, outputPerM: 0.60 },
    { provider: 'nvidia', model: 'qwen/qwen3-next-80b-a3b-instruct', inputPerM: 0.08, outputPerM: 0.30 },
    { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct', inputPerM: 0.20, outputPerM: 0.80 },
    { provider: 'openrouter', model: 'inclusionai/ling-2.6-1t:free', inputPerM: 0, outputPerM: 0 },
];
export function findPrice(provider, model) {
    return PRICES.find(p => p.provider === provider && p.model === model);
}
//# sourceMappingURL=prices.js.map