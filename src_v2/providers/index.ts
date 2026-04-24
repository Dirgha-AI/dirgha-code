/**
 * Provider registry + factory.
 *
 * Given a model id, returns the correct configured Provider. Providers
 * are lazy-constructed; missing API keys surface only on first use.
 */

import type { Provider, ProviderConfig } from './iface.js';
import { routeModel, type ProviderId } from './dispatch.js';
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

export interface ProviderRegistryConfig {
  nvidia?: ProviderConfig;
  openrouter?: ProviderConfig & { appName?: string; appUrl?: string };
  openai?: ProviderConfig & { organization?: string };
  anthropic?: ProviderConfig & { version?: string };
  gemini?: ProviderConfig;
  ollama?: ProviderConfig;
  fireworks?: ProviderConfig;
}

export class ProviderRegistry {
  private cache = new Map<ProviderId, Provider>();

  constructor(private config: ProviderRegistryConfig = {}) {}

  forModel(modelId: string): Provider {
    const id = routeModel(modelId);
    const cached = this.cache.get(id);
    if (cached) return cached;
    const provider = this.construct(id);
    this.cache.set(id, provider);
    return provider;
  }

  private construct(id: ProviderId): Provider {
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
