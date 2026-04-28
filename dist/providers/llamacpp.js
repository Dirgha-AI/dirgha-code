/**
 * llama.cpp provider — local model runtime via llama-server's
 * OpenAI-compatible /v1/chat/completions endpoint. Default port 8080.
 * Override with LLAMACPP_URL env var or config.baseUrl.
 */
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'http://localhost:8080/v1';
export class LlamaCppProvider {
    id = 'llamacpp';
    baseUrl;
    timeoutMs;
    constructor(config) {
        const envBase = process.env.LLAMACPP_URL;
        this.baseUrl = (config.baseUrl ?? envBase ?? DEFAULT_BASE).replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 120_000;
    }
    supportsTools(_modelId) {
        return true;
    }
    supportsThinking(_modelId) {
        return false;
    }
    stream(req) {
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
//# sourceMappingURL=llamacpp.js.map