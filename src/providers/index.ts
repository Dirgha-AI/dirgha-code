/**
 * Provider registry + factory.
 *
 * Given a model id, returns the correct configured Provider. Providers
 * are lazy-constructed; missing API keys surface only on first use.
 */

import type { Provider, ProviderConfig } from "./iface.js";
import { routeModel, type ProviderId } from "./dispatch.js";
import { NvidiaProvider } from "./nvidia.js";
import { OpenRouterProvider } from "./openrouter.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OllamaProvider } from "./ollama.js";
import { LlamaCppProvider } from "./llamacpp.js";
import { FireworksProvider } from "./fireworks.js";
import { DeepSeekProvider } from "./deepseek.js";
import {
  MistralProvider,
  CohereProvider,
  CerebrasProvider,
  TogetherProvider,
  PerplexityProvider,
  XaiProvider,
  GroqProvider,
  ZaiProvider,
} from "./extra-providers.js";
import { withRateLimit, type RateLimitOptions } from "./rate-limiter.js";

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
  openrouter?: ProviderConfig & { appName?: string; appUrl?: string };
  openai?: ProviderConfig & { organization?: string };
  anthropic?: ProviderConfig & { version?: string };
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

export class ProviderRegistry {
  private cache = new Map<ProviderId, Provider>();
  /** Timestamp in ms (performance.now) when each provider was cached. */
  private cacheTime = new Map<ProviderId, number>();
  /** Invalidate cached providers older than this many ms (30 min). */
  private static readonly CACHE_TTL_MS = 30 * 60 * 1000;

  constructor(private config: ProviderRegistryConfig = {}) {}

  /** Force-evict a cached provider so the next call to forModel
   *  re-constructs it with the latest config. Call this after updating
   *  API keys or other provider settings mid-session. */
  invalidate(providerId: ProviderId): void {
    this.cache.delete(providerId);
    this.cacheTime.delete(providerId);
  }

  /** Evict all cached providers (e.g. after bulk config reload). */
  invalidateAll(): void {
    this.cache.clear();
    this.cacheTime.clear();
  }

  forModel(modelId: string): Provider {
    const id = routeModel(modelId);
    const cached = this.cache.get(id);
    if (cached) {
      const cachedAt = this.cacheTime.get(id);
      if (cachedAt !== undefined) {
        const ageMs = performance.now() - cachedAt;
        if (ageMs < ProviderRegistry.CACHE_TTL_MS) return cached;
        // Entry expired — fall through to re-construct below.
      }
    }
    const provider = this.maybeRateLimit(this.construct(id));
    this.cache.set(id, provider);
    this.cacheTime.set(id, performance.now());
    return provider;
  }

  private maybeRateLimit(provider: Provider): Provider {
    // Known limitation: rateLimit config is captured at Registry
    // construction time. There is no way to add rate limiting
    // mid-session without reconstructing the full Registry.
    if (!this.config.rateLimit) return provider;
    return withRateLimit(provider, this.config.rateLimit);
  }

  private construct(id: ProviderId): Provider {
    switch (id) {
      case "nvidia":
        return new NvidiaProvider(this.config.nvidia ?? {});
      case "openrouter":
        return new OpenRouterProvider(this.config.openrouter ?? {});
      case "openai":
        return new OpenAIProvider(this.config.openai ?? {});
      case "anthropic":
        return new AnthropicProvider(this.config.anthropic ?? {});
      case "gemini":
        return new GeminiProvider(this.config.gemini ?? {});
      case "ollama":
        return new OllamaProvider(this.config.ollama ?? {});
      case "llamacpp":
        return new LlamaCppProvider(this.config.llamacpp ?? {});
      case "fireworks":
        return new FireworksProvider(this.config.fireworks ?? {});
      case "deepseek":
        return new DeepSeekProvider(this.config.deepseek ?? {});
      case "mistral":
        return new MistralProvider(this.config.mistral ?? {});
      case "cohere":
        return new CohereProvider(this.config.cohere ?? {});
      case "cerebras":
        return new CerebrasProvider(this.config.cerebras ?? {});
      case "together":
        return new TogetherProvider(this.config.together ?? {});
      case "perplexity":
        return new PerplexityProvider(this.config.perplexity ?? {});
      case "xai":
        return new XaiProvider(this.config.xai ?? {});
      case "groq":
        return new GroqProvider(this.config.groq ?? {});
      case "zai":
        return new ZaiProvider(this.config.zai ?? {});
    }
  }
}
