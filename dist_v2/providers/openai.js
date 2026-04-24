/**
 * OpenAI provider (native /chat/completions over the api.openai.com host).
 * Thin wrapper; most logic lives in the shared openai-compat adapter.
 */
import { ProviderError } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const REASONING_PREFIXES = ['o1', 'o3', 'o4'];
export class OpenAIProvider {
    id = 'openai';
    apiKey;
    baseUrl;
    timeoutMs;
    organization;
    constructor(config) {
        this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
        if (!this.apiKey)
            throw new ProviderError('OPENAI_API_KEY is required', this.id);
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 60_000;
        this.organization = config.organization;
    }
    supportsTools(modelId) {
        const m = modelId.replace(/^openai\//, '');
        return m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4');
    }
    supportsThinking(modelId) {
        const m = modelId.replace(/^openai\//, '');
        return REASONING_PREFIXES.some(p => m.startsWith(p));
    }
    stream(req) {
        const model = req.model.replace(/^openai\//, '');
        const extraHeaders = {};
        if (this.organization)
            extraHeaders['OpenAI-Organization'] = this.organization;
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
            extraHeaders,
        });
    }
}
//# sourceMappingURL=openai.js.map