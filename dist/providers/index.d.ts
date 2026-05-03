/**
 * Provider registry + factory.
 *
 * Given a model id, returns the correct configured Provider. Providers
 * are lazy-constructed; missing API keys surface only on first use.
 */
import type { Provider, ProviderConfig } from "./iface.js";
import { type ProviderId } from "./dispatch.js";
import { type RateLimitOptions } from "./rate-limiter.js";
export * from "./iface.js";
export * from "./dispatch.js";
export { NvidiaProvider } from "./nvidia.js";
export { OpenRouterProvider } from "./openrouter.js";
export { OpenAIProvider } from "./openai.js";
export { AnthropicProvider } from "./anthropic.js";
export { GeminiProvider } from "./gemini.js";
export { OllamaProvider } from "./ollama.js";
export { LlamaCppProvider } from "./llamacpp.js";
export { FireworksProvider } from "./fireworks.js";
export { DeepSeekProvider } from "./deepseek.js";
export interface ProviderRegistryConfig {
    nvidia?: ProviderConfig;
    openrouter?: ProviderConfig & {
        appName?: string;
        appUrl?: string;
    };
    openai?: ProviderConfig & {
        organization?: string;
    };
    anthropic?: ProviderConfig & {
        version?: string;
    };
    gemini?: ProviderConfig;
    ollama?: ProviderConfig;
    llamacpp?: ProviderConfig;
    fireworks?: ProviderConfig;
    deepseek?: ProviderConfig;
    mistral?: ProviderConfig;
    cohere?: ProviderConfig;
    cerebras?: ProviderConfig;
    together?: ProviderConfig;
    perplexity?: ProviderConfig;
    xai?: ProviderConfig;
    groq?: ProviderConfig;
    zai?: ProviderConfig;
    rateLimit?: RateLimitOptions;
}
export declare class ProviderRegistry {
    private config;
    private cache;
    /** Timestamp in ms (performance.now) when each provider was cached. */
    private cacheTime;
    /** Invalidate cached providers older than this many ms (30 min). */
    private static readonly CACHE_TTL_MS;
    constructor(config?: ProviderRegistryConfig);
    /** Force-evict a cached provider so the next call to forModel
     *  re-constructs it with the latest config. Call this after updating
     *  API keys or other provider settings mid-session. */
    invalidate(providerId: ProviderId): void;
    /** Evict all cached providers (e.g. after bulk config reload). */
    invalidateAll(): void;
    forModel(modelId: string): Provider;
    private maybeRateLimit;
    private construct;
}
