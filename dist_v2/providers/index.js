/**
 * Provider registry + factory.
 *
 * Given a model id, returns the correct configured Provider. Providers
 * are lazy-constructed; missing API keys surface only on first use.
 */
import { routeModel } from './dispatch.js';
import { NvidiaProvider } from './nvidia.js';
import { OpenRouterProvider } from './openrouter.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { FireworksProvider } from './fireworks.js';
export * from './iface.js';
export * from './dispatch.js';
export { NvidiaProvider } from './nvidia.js';
export { OpenRouterProvider } from './openrouter.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { GeminiProvider } from './gemini.js';
export { OllamaProvider } from './ollama.js';
export { FireworksProvider } from './fireworks.js';
export class ProviderRegistry {
    config;
    cache = new Map();
    constructor(config = {}) {
        this.config = config;
    }
    forModel(modelId) {
        const id = routeModel(modelId);
        const cached = this.cache.get(id);
        if (cached)
            return cached;
        const provider = this.construct(id);
        this.cache.set(id, provider);
        return provider;
    }
    construct(id) {
        switch (id) {
            case 'nvidia': return new NvidiaProvider(this.config.nvidia ?? {});
            case 'openrouter': return new OpenRouterProvider(this.config.openrouter ?? {});
            case 'openai': return new OpenAIProvider(this.config.openai ?? {});
            case 'anthropic': return new AnthropicProvider(this.config.anthropic ?? {});
            case 'gemini': return new GeminiProvider(this.config.gemini ?? {});
            case 'ollama': return new OllamaProvider(this.config.ollama ?? {});
            case 'fireworks': return new FireworksProvider(this.config.fireworks ?? {});
        }
    }
}
//# sourceMappingURL=index.js.map