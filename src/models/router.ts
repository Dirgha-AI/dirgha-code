/**
 * models/router.ts — Smart model router with LiteLLM as unified backend
 * 
 * The router is the main entry point for all model calls. It:
 * 1. Selects the best model for the task
 * 2. Routes through LiteLLM proxy (supports 100+ providers)
 * 3. Manages fallback chains on failures
 * 4. Tracks cost and latency
 * 5. Handles credential pooling
 */
import { LiteLLMUnifiedProvider } from './providers/litellm-unified.js';
import { ModelRegistry } from './registry.js';
import { getCredentialPoolManager } from './credential-pool.js';
import type { 
  ChatRequest, 
  ChatResponse, 
  StreamChunk,
  ModelInfo 
} from './types.js';

export interface RouterConfig {
  litellmBaseUrl: string;
  defaultModel: string;
  maxRetries: number;
  fallbackEnabled: boolean;
  costTracking: boolean;
}

export interface RouterStats {
  model: string;
  provider: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fallbackUsed: boolean;
}

export class ModelRouter {
  private provider: LiteLLMUnifiedProvider;
  private config: RouterConfig;
  private credentialManager = getCredentialPoolManager();

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      litellmBaseUrl: process.env['LITELLM_BASE_URL'] || 'http://localhost:4000',
      defaultModel: 'claude-sonnet-4-5',
      maxRetries: 3,
      fallbackEnabled: false,
      costTracking: true,
      ...config,
    };

    this.provider = new LiteLLMUnifiedProvider({
      name: 'litellm-unified',
      baseUrl: this.config.litellmBaseUrl,
      apiKey: process.env['LITELLM_MASTER_KEY'] || 'local',
    });
  }

  /**
   * Main chat method - automatically selects model and handles fallbacks
   */
  async chat(
    request: ChatRequest,
    options: { 
      preferredModel?: string;
      task?: 'coding' | 'reasoning' | 'vision' | 'fast' | 'cheap';
    } = {}
  ): Promise<{ response: ChatResponse; stats: RouterStats }> {
    const startTime = Date.now();
    let model = this.selectModel(request, options);
    let lastError: Error | undefined;
    let fallbackUsed = false;

    // Try primary model
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.tryModel(model, request);
        const latencyMs = Date.now() - startTime;
        
        const stats: RouterStats = {
          model,
          provider: ModelRegistry.getModel(model)?.provider || 'unknown',
          latencyMs,
          inputTokens: response.usage?.inputTokens || 0,
          outputTokens: response.usage?.outputTokens || 0,
          costUsd: this.calculateCost(model, response.usage),
          fallbackUsed,
        };

        return { response, stats };
      } catch (err) {
        lastError = err as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(err)) {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    // If fallback enabled, try fallback chain
    if (this.config.fallbackEnabled) {
      const fallbacks = ModelRegistry.getFallbackChain(model);
      
      for (const fallback of fallbacks) {
        try {
          fallbackUsed = true;
          const response = await this.tryModel(fallback, request);
          const latencyMs = Date.now() - startTime;

          const stats: RouterStats = {
            model: fallback,
            provider: ModelRegistry.getModel(fallback)?.provider || 'unknown',
            latencyMs,
            inputTokens: response.usage?.inputTokens || 0,
            outputTokens: response.usage?.outputTokens || 0,
            costUsd: this.calculateCost(fallback, response.usage),
            fallbackUsed: true,
          };

          return { response, stats };
        } catch {
          // Continue to next fallback
          continue;
        }
      }
    }

    // All attempts failed
    throw new Error(
      `All models failed. Primary: ${model}, ` +
      `Fallbacks: ${ModelRegistry.getFallbackChain(model).join(', ') || 'none'}. ` +
      `Last error: ${lastError?.message}`
    );
  }

  /**
   * Stream responses with automatic model selection
   */
  async *stream(
    request: ChatRequest,
    options: { 
      preferredModel?: string;
      task?: 'coding' | 'reasoning' | 'vision' | 'fast' | 'cheap';
    } = {}
  ): AsyncGenerator<StreamChunk & { stats?: Partial<RouterStats> }> {
    const model = this.selectModel(request, options);
    
    try {
      // Collect chunks and annotate with metadata
      for await (const chunk of this.provider.stream({ ...request, model })) {
        yield {
          ...chunk,
          stats: {
            model,
            provider: ModelRegistry.getModel(model)?.provider,
          },
        };
      }
    } catch (err) {
      // Try fallback if streaming fails
      if (this.config.fallbackEnabled) {
        const fallbacks = ModelRegistry.getFallbackChain(model);
        for (const fallback of fallbacks) {
          try {
            for await (const chunk of this.provider.stream({ ...request, model: fallback })) {
              yield {
                ...chunk,
                stats: {
                  model: fallback,
                  provider: ModelRegistry.getModel(fallback)?.provider,
                  fallbackUsed: true,
                },
              };
            }
            return;
          } catch {
            continue;
          }
        }
      }
      throw err;
    }
  }

  /**
   * Health check for LiteLLM proxy
   */
  async healthCheck(): Promise<{ healthy: boolean; models: number; latency: number }> {
    const start = Date.now();
    const healthy = await this.provider.healthCheck();
    const models = healthy ? (await this.provider.listModels()).length : 0;
    
    return {
      healthy,
      models,
      latency: Date.now() - start,
    };
  }

  /**
   * List available models from registry
   */
  listAvailableModels(): ModelInfo[] {
    return ModelRegistry.getModelsByTag('recommended');
  }

  /**
   * Get router configuration
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Update router configuration
   */
  updateConfig(updates: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Recreate provider if base URL changed
    if (updates.litellmBaseUrl) {
      this.provider = new LiteLLMUnifiedProvider({
        name: 'litellm-unified',
        baseUrl: this.config.litellmBaseUrl,
        apiKey: process.env['LITELLM_MASTER_KEY'] || 'local',
      });
    }
  }

  private selectModel(
    request: ChatRequest,
    options: { preferredModel?: string; task?: string }
  ): string {
    // 1. Use explicitly preferred model
    if (options.preferredModel) {
      return options.preferredModel;
    }

    // 2. Use task-based recommendation
    if (options.task) {
      return ModelRegistry.getRecommendedModel(options.task as any);
    }

    // 3. Use request model if valid
    if (request.model && ModelRegistry.getModel(request.model)) {
      return request.model;
    }

    // 4. Detect from message content
    const lastMessage = request.messages[request.messages.length - 1];
    const content = typeof lastMessage?.content === 'string' 
      ? lastMessage.content 
      : '';

    if (content.includes('```') || content.includes('code')) {
      return ModelRegistry.getRecommendedModel('coding');
    }
    if (content.includes('image') || content.includes('picture')) {
      return ModelRegistry.getRecommendedModel('vision');
    }
    if (content.length > 1000) {
      return ModelRegistry.getRecommendedModel('reasoning');
    }

    // 5. Default
    return this.config.defaultModel;
  }

  private async tryModel(model: string, request: ChatRequest): Promise<ChatResponse> {
    const modelInfo = ModelRegistry.getModel(model);
    
    // If model uses direct provider (not LiteLLM), use credential pool
    if (modelInfo && !['openrouter', 'fireworks'].includes(modelInfo.provider)) {
      const key = this.credentialManager.getKey(modelInfo.provider);
      if (key) {
        // Set environment variable for this call
        const envVar = `${modelInfo.provider.toUpperCase()}_API_KEY`;
        process.env[envVar] = key;
      }
    }

    return await this.provider.chat({ ...request, model });
  }

  private calculateCost(model: string, usage?: { inputTokens?: number; outputTokens?: number }): number {
    if (!usage || !this.config.costTracking) return 0;

    const modelInfo = ModelRegistry.getModel(model);
    if (!modelInfo) return 0;

    const inputCost = (usage.inputTokens || 0) * (modelInfo.pricing.inputPer1k / 1000);
    const outputCost = (usage.outputTokens || 0) * (modelInfo.pricing.outputPer1k / 1000);

    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }

  private isRetryableError(err: unknown): boolean {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    const retryable = [
      'rate limit',
      '429',
      'timeout',
      'econnrefused',
      'overloaded',
      '503',
      '502',
      '504',
    ];
    return retryable.some(pattern => message.includes(pattern));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory for easy instantiation
export function createModelRouter(config?: Partial<RouterConfig>): ModelRouter {
  return new ModelRouter(config);
}
