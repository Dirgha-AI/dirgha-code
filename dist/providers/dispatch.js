/**
 * Model identifier → provider id routing.
 *
 * Pure function. Adding a new provider here is a one-line change.
 * Model ids use provider-scoped prefixes (e.g., "anthropic/...",
 * "nvidia/..."); bare ids fall through to the catch-all rules at the
 * end.
 */
import { migrateDeprecatedModel } from '../intelligence/prices.js';
// Specific model IDs that NVIDIA NIM serves. The vendor-prefix on these
// IDs (e.g. `moonshotai/`, `qwen/`, `meta/`) is shared with OpenRouter,
// so we route by exact ID rather than prefix to avoid sending OR-only
// variants like `moonshotai/kimi-k2.5` to NIM (which 404s).
const NVIDIA_NIM_MODELS = new Set([
    'deepseek-ai/deepseek-v4-pro',
    'deepseek-ai/deepseek-v4-flash',
    'moonshotai/kimi-k2-instruct',
    'qwen/qwen3-next-80b-a3b-instruct',
    'meta/llama-3.3-70b-instruct',
]);
const RULES = [
    // Specific NVIDIA NIM models (override the prefix-based OR fallback).
    { match: id => NVIDIA_NIM_MODELS.has(id), provider: 'nvidia' },
    // Native, no-prefix model IDs go to first-party APIs.
    { match: id => id.startsWith('claude-'), provider: 'anthropic' },
    { match: id => id.startsWith('gpt-') || /^o[1-9](?:-.+)?$/i.test(id), provider: 'openai' },
    { match: id => id.startsWith('gemini-'), provider: 'gemini' },
    // Local & explicit-prefix providers.
    { match: id => id.startsWith('ollama/'), provider: 'ollama' },
    { match: id => id.startsWith('llamacpp/'), provider: 'llamacpp' },
    { match: id => id.startsWith('fireworks/'), provider: 'fireworks' },
    // DeepSeek native API — bare canonical ids (deepseek-chat, deepseek-reasoner)
    // and the explicit deepseek-native: prefix. Vendor-prefixed `deepseek/...`
    // slugs still go to OpenRouter unless DIRGHA_PROVIDER=deepseek is set.
    { match: id => /^deepseek-(chat|reasoner|coder)$/.test(id), provider: 'deepseek' },
    { match: id => id.startsWith('deepseek-native/'), provider: 'deepseek' },
    // Catch-all: any vendor-prefixed slug or `:free` variant goes via
    // OpenRouter (anthropic/, openai/, google/, deepseek/, moonshotai/,
    // minimax/, qwen/, tencent/, z-ai/, inclusionai/, etc.).
    { match: id => id.includes('/') || id.includes(':free'), provider: 'openrouter' },
];
export function routeModel(modelId) {
    const migrated = migrateDeprecatedModel(modelId);
    for (const rule of RULES) {
        if (rule.match(migrated))
            return rule.provider;
    }
    throw new Error(`No provider configured for model "${migrated}". Add a routing rule in providers/dispatch.ts.`);
}
export function resolveModelForDispatch(modelId) {
    return migrateDeprecatedModel(modelId);
}
export function isKnownProvider(id) {
    return (id === 'anthropic' || id === 'openai' || id === 'gemini'
        || id === 'openrouter' || id === 'nvidia' || id === 'ollama'
        || id === 'llamacpp' || id === 'fireworks' || id === 'deepseek');
}
//# sourceMappingURL=dispatch.js.map