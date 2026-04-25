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
import type { Provider, ProviderConfig } from './iface.js';
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
export declare function defineOpenAICompatProvider(spec: OpenAICompatSpec): new (config?: ProviderConfig) => Provider;
