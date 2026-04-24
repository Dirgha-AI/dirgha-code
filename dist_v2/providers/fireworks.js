/**
 * Fireworks provider. Kept for back-compat routing only — the upstream
 * plan that fronted this provider is wound down and the default router
 * no longer uses it. The adapter still exists so existing session
 * transcripts that reference fireworks/* model ids remain decodable.
 */
import { ProviderError } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'https://api.fireworks.ai/inference/v1';
export class FireworksProvider {
    id = 'fireworks';
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey ?? process.env.FIREWORKS_API_KEY ?? '';
        if (!this.apiKey)
            throw new ProviderError('FIREWORKS_API_KEY is required', this.id);
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 60_000;
    }
    supportsTools(_modelId) {
        return true;
    }
    supportsThinking(_modelId) {
        return false;
    }
    stream(req) {
        const model = req.model.replace(/^fireworks\//, '');
        return streamChatCompletions({
            providerName: this.id,
            endpoint: `${this.baseUrl}/chat/completions`,
            apiKey: this.apiKey,
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
//# sourceMappingURL=fireworks.js.map