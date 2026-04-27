/**
 * Provider registry + factory.
 *
 * Given a model id, returns the correct configured Provider. Providers
 * are lazy-constructed; missing API keys surface only on first use.
 */
import type { Provider, ProviderConfig } from './iface.js';
export * from './iface.js';
export * from './dispatch.js';
export { NvidiaProvider } from './nvidia.js';
export { OpenRouterProvider } from './openrouter.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { GeminiProvider } from './gemini.js';
export { OllamaProvider } from './ollama.js';
export { LlamaCppProvider } from './llamacpp.js';
export { FireworksProvider } from './fireworks.js';
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
}
export declare class ProviderRegistry {
    private config;
    private cache;
    constructor(config?: ProviderRegistryConfig);
    forModel(modelId: string): Provider;
    private construct;
}
