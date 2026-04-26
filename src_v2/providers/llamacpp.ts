/**
 * llama.cpp provider — local model runtime via llama-server's
 * OpenAI-compatible /v1/chat/completions endpoint. Default port 8080.
 * Override with LLAMACPP_URL env var or config.baseUrl.
 */

import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';

const DEFAULT_BASE = 'http://localhost:8080/v1';

export class LlamaCppProvider implements Provider {
  readonly id = 'llamacpp';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    const envBase = process.env.LLAMACPP_URL;
    this.baseUrl = (config.baseUrl ?? envBase ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  supportsTools(_modelId: string): boolean {
    return true;
  }

  supportsThinking(_modelId: string): boolean {
    return false;
  }

  stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    const model = req.model.replace(/^llamacpp\//, '');
    return streamChatCompletions({
      providerName: this.id,
      endpoint: `${this.baseUrl}/chat/completions`,
      apiKey: 'local',
      model,
      messages: req.messages,
      tools: req.tools,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      timeoutMs: this.timeoutMs,
    });
  }
}
