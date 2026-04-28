/**
 * Factory for OpenAI-/chat-completions-compatible providers.
 *
 * `streamChatCompletions` (in openai-compat.ts) is the wire protocol;
 * every concrete provider that speaks it (openai, openrouter, nvidia,
 * fireworks, deepseek-native, tencent-native, …) differs only in:
 *   - baseUrl
 *   - apiKey env var
 *   - model-id prefix to strip
 *   - tool-support / thinking detection
 *   - extra headers (e.g. OpenRouter's HTTP-Referer)
 *   - timeoutMs
 *
 * `defineOpenAICompatProvider(spec)` packages all of those into a
 * single factory so adding a new provider becomes a configuration
 * change, not a new class.
 *
 * Anthropic-messages and Gemini-generate are different wire protocols;
 * they keep their own classes (`anthropic.ts`, `gemini.ts`).
 */

import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
import { ProviderError } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';

export interface OpenAICompatSpec {
  /** Stable provider id used by routing + audit logs (e.g. 'openai', 'nvidia'). */
  id: string;
  /** Default base URL when ProviderConfig.baseUrl isn't set. */
  defaultBaseUrl: string;
  /** Env var consulted when ProviderConfig.apiKey isn't passed. */
  apiKeyEnv: string;
  /** Default request timeout in milliseconds. */
  defaultTimeoutMs?: number;
  /**
   * Strip a leading prefix (e.g. `openai/`) from the model id before
   * sending. Some providers expect bare names; OpenRouter accepts the
   * vendor prefix verbatim, so this stays optional.
   */
  modelPrefixToStrip?: RegExp;
  /** Tool-call support detector. Defaults to "always supports tools". */
  supportsTools?: (modelId: string) => boolean;
  /** Thinking-token support detector. Defaults to "no thinking". */
  supportsThinking?: (modelId: string) => boolean;
  /** Static headers to attach to every request (e.g. OpenRouter `HTTP-Referer`). */
  extraHeaders?: Record<string, string>;
  /**
   * Provider-specific request-body extension. Receives the model id (so
   * thinking-only-on-some-models is expressible) and returns a partial
   * body that gets merged in. Use for things like NVIDIA's
   * `chat_template_kwargs`.
   */
  extraBody?: (modelId: string, supportsThinking: boolean) => Record<string, unknown> | undefined;
  /** Description-length cap on tool definitions; OpenRouter caps at 200. */
  toolDescriptionCap?: number;
}

export function defineOpenAICompatProvider(spec: OpenAICompatSpec): new (config?: ProviderConfig) => Provider {
  return class ConfiguredProvider implements Provider {
    readonly id = spec.id;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly timeoutMs: number;
    private readonly extraHeaders: Record<string, string>;

    constructor(config: ProviderConfig = {}) {
      this.apiKey = config.apiKey ?? process.env[spec.apiKeyEnv] ?? '';
      if (!this.apiKey) throw new ProviderError(`${spec.apiKeyEnv} is required`, spec.id);
      this.baseUrl = (config.baseUrl ?? spec.defaultBaseUrl).replace(/\/+$/, '');
      this.timeoutMs = config.timeoutMs ?? spec.defaultTimeoutMs ?? 60_000;
      this.extraHeaders = { ...(spec.extraHeaders ?? {}) };
    }

    supportsTools(modelId: string): boolean {
      return spec.supportsTools ? spec.supportsTools(modelId) : true;
    }

    supportsThinking(modelId: string): boolean {
      return spec.supportsThinking ? spec.supportsThinking(modelId) : false;
    }

    stream(req: StreamRequest): AsyncIterable<AgentEvent> {
      const model = spec.modelPrefixToStrip ? req.model.replace(spec.modelPrefixToStrip, '') : req.model;
      const tools = this.supportsTools(req.model) ? req.tools : undefined;
      const cap = spec.toolDescriptionCap ?? 200;
      const supportsThinking = this.supportsThinking(req.model);
      const extra = spec.extraBody ? spec.extraBody(req.model, supportsThinking) : undefined;
      return streamChatCompletions({
        providerName: spec.id,
        endpoint: `${this.baseUrl}/chat/completions`,
        apiKey: this.apiKey,
        model,
        messages: req.messages,
        tools,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: req.signal,
        timeoutMs: this.timeoutMs,
        includeThinking: supportsThinking,
        extraHeaders: this.extraHeaders,
        sanitizeToolDescriptions: desc => (desc.length > cap ? `${desc.slice(0, cap - 3)}...` : desc),
        ...(extra !== undefined ? { extraBody: extra } : {}),
      });
    }
  };
}
