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
import { LlamaCppProvider } from './llamacpp.js';
import { FireworksProvider } from './fireworks.js';
import { DeepSeekProvider } from './deepseek.js';
import { MistralProvider, CohereProvider, CerebrasProvider, TogetherProvider, PerplexityProvider, XaiProvider, GroqProvider, ZaiProvider, } from './extra-providers.js';
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
export { DeepSeekProvider } from './deepseek.js';
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
            case 'llamacpp': return new LlamaCppProvider(this.config.llamacpp ?? {});
            case 'fireworks': return new FireworksProvider(this.config.fireworks ?? {});
            case 'deepseek': return new DeepSeekProvider(this.config.deepseek ?? {});
            case 'mistral': return new MistralProvider(this.config.mistral ?? {});
            case 'cohere': return new CohereProvider(this.config.cohere ?? {});
            case 'cerebras': return new CerebrasProvider(this.config.cerebras ?? {});
            case 'together': return new TogetherProvider(this.config.together ?? {});
            case 'perplexity': return new PerplexityProvider(this.config.perplexity ?? {});
            case 'xai': return new XaiProvider(this.config.xai ?? {});
            case 'groq': return new GroqProvider(this.config.groq ?? {});
            case 'zai': return new ZaiProvider(this.config.zai ?? {});
        }
    }
}
//# sourceMappingURL=index.js.map