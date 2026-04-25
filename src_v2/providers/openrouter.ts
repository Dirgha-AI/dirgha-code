/**
 * OpenRouter provider. OpenAI-compatible, with three conveniences:
 *   - Includes the free tier Ling model used for code generation.
 *   - Emits provider-identifying headers that the OpenRouter console
 *     surfaces (HTTP-Referer, X-Title).
 *   - Supports free-tier models via the ":free" suffix.
 */

import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
import { ProviderError } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';

const TOOL_SUPPORT = [
  /^inclusionai\/ling/,
  /^anthropic\//,
  /^openai\//,
  /^google\/gemini/,
  /^mistralai\//,
  /^meta-llama\//,
  /^qwen\//,
  /^deepseek\//,
  /^moonshotai\//,
  /^minimaxai?\//,  // matches both `minimaxai/` (legacy) and `minimax/` (current OR slug)
  /^z-ai\//,
  /^tencent\//,
];

const THINKING_PATTERNS = [/^deepseek-ai\//, /^anthropic\/claude-opus/, /^openai\/o[1-9]/];

export class OpenRouterProvider implements Provider {
  readonly id = 'openrouter';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly appName: string;
  private readonly appUrl: string;

  constructor(config: ProviderConfig & { appName?: string; appUrl?: string }) {
    this.apiKey = config.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
    if (!this.apiKey) throw new ProviderError('OPENROUTER_API_KEY is required', this.id);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.appName = config.appName ?? 'dirgha-cli';
    this.appUrl = config.appUrl ?? 'https://dirgha.ai';
  }

  supportsTools(modelId: string): boolean {
    const base = modelId.replace(/:free$/, '').replace(/^openrouter\//, '');
    return TOOL_SUPPORT.some(rx => rx.test(base));
  }

  supportsThinking(modelId: string): boolean {
    return THINKING_PATTERNS.some(rx => rx.test(modelId));
  }

  stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    const model = req.model.replace(/^openrouter\//, '');
    return streamChatCompletions({
      providerName: this.id,
      endpoint: `${this.baseUrl}/chat/completions`,
      apiKey: this.apiKey,
      model,
      messages: req.messages,
      tools: this.supportsTools(req.model) ? req.tools : undefined,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      timeoutMs: this.timeoutMs,
      includeThinking: this.supportsThinking(req.model),
      extraHeaders: {
        'HTTP-Referer': this.appUrl,
        'X-Title': this.appName,
      },
    });
  }
}
