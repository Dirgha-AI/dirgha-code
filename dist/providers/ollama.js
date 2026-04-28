/**
 * Ollama provider — local model runtime. Uses OpenAI-compatible
 * /v1/chat/completions endpoint exposed by recent Ollama versions.
 */
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'http://localhost:11434/v1';
export class OllamaProvider {
    id = 'ollama';
    baseUrl;
    timeoutMs;
    constructor(config) {
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 120_000;
    }
    supportsTools(_modelId) {
        return true;
    }
    supportsThinking(_modelId) {
        return false;
    }
    stream(req) {
        const model = req.model.replace(/^ollama\//, '');
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
//# sourceMappingURL=ollama.js.map