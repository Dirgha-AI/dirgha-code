/**
 * Model identifier → provider id routing.
 *
 * Pure function. Adding a new provider here is a one-line change.
 * Model ids use provider-scoped prefixes (e.g., "anthropic/...",
 * "nvidia/..."); bare ids fall through to the catch-all rules at the
 * end.
 */
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'nvidia' | 'ollama' | 'llamacpp' | 'fireworks';
export declare function routeModel(modelId: string): ProviderId;
export declare function isKnownProvider(id: string): id is ProviderId;
