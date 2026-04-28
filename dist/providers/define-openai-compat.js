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
import { ProviderError } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';
export function defineOpenAICompatProvider(spec) {
    return class ConfiguredProvider {
        id = spec.id;
        apiKey;
        baseUrl;
        timeoutMs;
        extraHeaders;
        constructor(config = {}) {
            this.apiKey = config.apiKey ?? process.env[spec.apiKeyEnv] ?? '';
            if (!this.apiKey)
                throw new ProviderError(`${spec.apiKeyEnv} is required`, spec.id);
            this.baseUrl = (config.baseUrl ?? spec.defaultBaseUrl).replace(/\/+$/, '');
            this.timeoutMs = config.timeoutMs ?? spec.defaultTimeoutMs ?? 60_000;
            this.extraHeaders = { ...(spec.extraHeaders ?? {}) };
        }
        supportsTools(modelId) {
            return spec.supportsTools ? spec.supportsTools(modelId) : true;
        }
        supportsThinking(modelId) {
            return spec.supportsThinking ? spec.supportsThinking(modelId) : false;
        }
        stream(req) {
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
//# sourceMappingURL=define-openai-compat.js.map