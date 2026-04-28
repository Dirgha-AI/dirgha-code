/**
 * OpenAI provider (native /chat/completions over the api.openai.com host).
 * Thin wrapper; most logic lives in the shared openai-compat adapter.
 */
import { ProviderError } from './iface.js';
import { postJSON } from './http.js';
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_IMAGE_MODEL = 'dall-e-3';
const IMAGE_GEN_TIMEOUT_MS = 30_000;
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
    async generateImage(req, signal) {
        const model = normalizeImageModel(req.model) ?? DEFAULT_IMAGE_MODEL;
        const size = pickDalleSize(req.width ?? 1024, req.height ?? 1024);
        const body = {
            model,
            prompt: req.prompt,
            n: 1,
            size,
            response_format: 'b64_json',
        };
        const extraHeaders = {};
        if (this.organization)
            extraHeaders['OpenAI-Organization'] = this.organization;
        const parsed = await postJSON({
            url: `${this.baseUrl}/images/generations`,
            apiKey: this.apiKey,
            body,
            providerName: this.id,
            signal,
            timeoutMs: IMAGE_GEN_TIMEOUT_MS,
            extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
        });
        const base64 = parsed.data?.[0]?.b64_json;
        if (!base64) {
            throw new ProviderError('OpenAI image response missing b64_json payload', this.id);
        }
        return { base64, mimeType: 'image/png', model };
    }
}
function normalizeImageModel(input) {
    if (!input)
        return undefined;
    const lower = input.toLowerCase().replace(/^openai\//, '');
    if (lower === 'dalle' || lower === 'dall-e' || lower === 'dall-e-3')
        return 'dall-e-3';
    if (lower === 'dall-e-2')
        return 'dall-e-2';
    return input;
}
/**
 * DALL-E 3 accepts exactly: 1024x1024, 1792x1024, 1024x1792. Map (w,h)
 * to the nearest landscape/portrait/square based on aspect ratio.
 */
function pickDalleSize(width, height) {
    if (width <= 0 || height <= 0)
        return '1024x1024';
    const ratio = width / height;
    if (ratio > 1.2)
        return '1792x1024';
    if (ratio < 0.83)
        return '1024x1792';
    return '1024x1024';
}
//# sourceMappingURL=openai.js.map