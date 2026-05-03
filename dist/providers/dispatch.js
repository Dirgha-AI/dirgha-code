/**
 * Model identifier → provider id routing.
 *
 * Pure function. Adding a new provider here is a one-line change.
 * Model ids use provider-scoped prefixes (e.g., "anthropic/...",
 * "nvidia/..."); bare ids fall through to the catch-all rules at the
 * end.
 */
import { migrateDeprecatedModel } from "../intelligence/prices.js";
import { NIM_CATALOGUE } from "./nim-catalogue.js";
// Specific model IDs that NVIDIA NIM serves — derived from the NIM_CATALOGUE
// so there is a single source of truth. Also include NIM-hosted models that
// are not in the main catalogue (legacy / provider-prefixed nvidia/* models).
const NVIDIA_NIM_MODELS = new Set([
    // Catalogue models (primary list)
    ...NIM_CATALOGUE.map((m) => m.id),
    // Additional NIM-hosted models not in the NIM_CATALOGUE
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "nvidia/nemotron-3-nano-30b-a3b",
    "nvidia/nemotron-3-super-120b-a12b",
    "mistralai/mistral-nemotron",
    "mistralai/devstral-2-123b-instruct-2512",
]);
// RULE ORDERING INVARIANTS (must be preserved — tested by dispatch.test.ts):
//   1. Exact native-ID prefix rules (claude-, gpt-, gemini-) come FIRST so
//      they never match via the catch-all OR rule.
//   2. Explicit vendor-prefix rules (deepseek-ai/, ollama/, fireworks/, etc.)
//      come BEFORE the NVIDIA NIM catalogue rule so user-chosen providers are
//      never hijacked by the catalogue.
//   3. The NIM catalogue rule (exact-set match against NVIDIA_NIM_MODELS)
//      comes BEFORE the catch-all because those catalogued model IDs would
//      otherwise fall through to OpenRouter.
//   4. Local/extra-provider explicit-prefix rules (ollama/, llamacpp/,
//      fireworks/, mistral/, cohere/, etc.) come AFTER NIM but BEFORE the
//      catch-all so users can explicitly pick these providers.
//   5. The catch-all (any `/` or `:free` suffix) MUST be last so it only
//      fires when no other rule has matched.
const RULES = [
    // Native, no-prefix model IDs go to first-party APIs.
    { match: (id) => id.startsWith("claude-"), provider: "anthropic" },
    {
        match: (id) => id.startsWith("gpt-") || /^o[1-9](?:-.+)?$/i.test(id),
        provider: "openai",
    },
    { match: (id) => id.startsWith("gemini-"), provider: "gemini" },
    // Vendor-prefix explicit providers MUST come before the NIM catalogue
    // rule. When a user types "deepseek-ai/deepseek-v4-pro" they explicitly
    // chose native DeepSeek — the NIM catalogue should not hijack that.
    { match: (id) => id.startsWith("deepseek-ai/"), provider: "deepseek" },
    { match: (id) => id.startsWith("deepseek-native/"), provider: "deepseek" },
    // DeepSeek native API — bare canonical IDs.
    {
        match: (id) => /^deepseek-(chat|reasoner|coder|v4-flash|v4-pro|r1|prover-v2)$/.test(id),
        provider: "deepseek",
    },
    // Specific NVIDIA NIM models — after explicit prefixes so vendor-prefix
    // deepseek/ai/, anthropic/, etc. are never hijacked by the NIM catalogue.
    { match: (id) => NVIDIA_NIM_MODELS.has(id), provider: "nvidia" },
    // Local & explicit-prefix providers.
    { match: (id) => id.startsWith("ollama/"), provider: "ollama" },
    { match: (id) => id.startsWith("llamacpp/"), provider: "llamacpp" },
    { match: (id) => id.startsWith("fireworks/"), provider: "fireworks" },
    // Extra OpenAI-compat providers (1.10.1). These are explicit-prefix —
    // the user types `mistral/...`, `cohere/...`, etc. to dispatch here
    // rather than fall through to OpenRouter's catch-all. Lets users pick
    // the native API for lower latency / better quotas vs the OR mirror.
    { match: (id) => id.startsWith("mistral/"), provider: "mistral" },
    { match: (id) => id.startsWith("cohere/"), provider: "cohere" },
    { match: (id) => id.startsWith("cerebras/"), provider: "cerebras" },
    {
        match: (id) => id.startsWith("together/") || id.startsWith("togetherai/"),
        provider: "together",
    },
    { match: (id) => id.startsWith("perplexity/"), provider: "perplexity" },
    {
        match: (id) => id.startsWith("xai/") || id.startsWith("x-ai/") || /^grok-/i.test(id),
        provider: "xai",
    },
    { match: (id) => id.startsWith("groq/"), provider: "groq" },
    {
        match: (id) => id.startsWith("zai/") || id.startsWith("z-ai/") || id.startsWith("glm/"),
        provider: "zai",
    },
    // Catch-all: any vendor-prefixed slug or `:free` variant goes via
    // OpenRouter (anthropic/, openai/, google/, deepseek/, moonshotai/,
    // minimax/, qwen/, tencent/, z-ai/, inclusionai/, etc.).
    {
        match: (id) => id.includes("/") || id.endsWith(":free"),
        provider: "openrouter",
    },
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
    return (id === "anthropic" ||
        id === "openai" ||
        id === "gemini" ||
        id === "openrouter" ||
        id === "nvidia" ||
        id === "ollama" ||
        id === "llamacpp" ||
        id === "fireworks" ||
        id === "deepseek" ||
        id === "mistral" ||
        id === "cohere" ||
        id === "cerebras" ||
        id === "together" ||
        id === "perplexity" ||
        id === "xai" ||
        id === "groq" ||
        id === "zai");
}
//# sourceMappingURL=dispatch.js.map