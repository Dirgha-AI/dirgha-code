/**
 * Model identifier → provider id routing.
 *
 * Pure function. Adding a new provider here is a one-line change.
 * Model ids use provider-scoped prefixes (e.g., "anthropic/...",
 * "nvidia/..."); bare ids fall through to the catch-all rules at the
 * end.
 */
const RULES = [
    { match: id => id.startsWith('anthropic/') || id.startsWith('claude-'), provider: 'anthropic' },
    { match: id => id.startsWith('openai/') || id.startsWith('gpt-') || /^o[1-9](?:-.+)?$/i.test(id), provider: 'openai' },
    { match: id => id.startsWith('google/') || id.startsWith('gemini-'), provider: 'gemini' },
    { match: id => id.startsWith('ollama/'), provider: 'ollama' },
    { match: id => id.startsWith('fireworks/'), provider: 'fireworks' },
    {
        match: id => id.startsWith('openrouter/')
            || id.startsWith('inclusionai/')
            || id.includes(':free'),
        provider: 'openrouter',
    },
    {
        match: id => id.startsWith('minimaxai/')
            || id.startsWith('moonshotai/')
            || id.startsWith('mistralai/')
            || id.startsWith('z-ai/')
            || id.startsWith('meta/')
            || id.startsWith('nvidia/')
            || id.startsWith('qwen/')
            || id.startsWith('deepseek-ai/'),
        provider: 'nvidia',
    },
];
export function routeModel(modelId) {
    for (const rule of RULES) {
        if (rule.match(modelId))
            return rule.provider;
    }
    throw new Error(`No provider configured for model "${modelId}". Add a routing rule in providers/dispatch.ts.`);
}
export function isKnownProvider(id) {
    return (id === 'anthropic' || id === 'openai' || id === 'gemini'
        || id === 'openrouter' || id === 'nvidia' || id === 'ollama'
        || id === 'fireworks');
}
//# sourceMappingURL=dispatch.js.map