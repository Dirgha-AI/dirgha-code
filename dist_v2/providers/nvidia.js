/**
 * NVIDIA NIM provider.
 *
 * NIM is OpenAI-compatible for /chat/completions, with three quirks:
 *
 *   1. Not every hosted model accepts the `tools` field. Sending tools
 *      to a non-tool model returns HTTP 400. We gate on an allowlist.
 *   2. NIM tokenises tool descriptions tightly and rejects payloads
 *      with very long descriptions. We cap descriptions at 200 chars
 *      before sending.
 *   3. Selected models emit reasoning deltas via `reasoning_content`
 *      rather than `content`. We surface those as thinking events when
 *      the caller opts in.
 */
import { ProviderError } from './iface.js';
import { postJSON } from './http.js';
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'https://integrate.api.nvidia.com/v1';
const IMAGE_GEN_BASE = 'https://ai.api.nvidia.com/v1/genai';
const DEFAULT_IMAGE_MODEL = 'black-forest-labs/flux.1-schnell';
const IMAGE_GEN_TIMEOUT_MS = 30_000;
const TOOLS_SUPPORTED = new Set([
    'moonshotai/kimi-k2-instruct',
    'moonshotai/kimi-k2.5-turbo',
    'minimaxai/minimax-m2.7',
    'minimaxai/minimax-m2',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'meta/llama-3.1-405b-instruct',
    'meta/llama-4-maverick-17b-instruct',
    'meta/llama-4-scout-17b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    'z-ai/glm-5.1',
    'deepseek-ai/deepseek-v3.1',
    'deepseek-ai/deepseek-r1',
    'qwen/qwen3-coder',
    'qwen/qwen3-235b-a22b',
    'qwen/qwen3-next-80b-a3b-instruct',
]);
const THINKING_SUPPORTED = new Set([
    'z-ai/glm-5.1',
    'deepseek-ai/deepseek-v3.1',
    'deepseek-ai/deepseek-r1',
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
]);
export class NvidiaProvider {
    id = 'nvidia';
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY ?? '';
        if (!this.apiKey) {
            throw new ProviderError('NVIDIA_API_KEY is required', this.id);
        }
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        // NVIDIA NIM tool-followup latency p99 occasionally exceeds 60s; 120s
        // absorbs the variance without making genuine hangs invisible.
        this.timeoutMs = config.timeoutMs ?? 120_000;
    }
    supportsTools(modelId) {
        return TOOLS_SUPPORTED.has(modelId);
    }
    supportsThinking(modelId) {
        return THINKING_SUPPORTED.has(modelId);
    }
    stream(req) {
        const supportsTools = this.supportsTools(req.model);
        const supportsThinking = this.supportsThinking(req.model);
        const extraBody = {};
        if (supportsThinking && req.thinking && req.thinking !== 'off') {
            extraBody.chat_template_kwargs = { enable_thinking: true };
        }
        return streamChatCompletions({
            providerName: this.id,
            endpoint: `${this.baseUrl}/chat/completions`,
            apiKey: this.apiKey,
            model: req.model,
            messages: req.messages,
            tools: supportsTools ? req.tools : undefined,
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            signal: req.signal,
            timeoutMs: this.timeoutMs,
            sanitizeToolDescriptions: desc => (desc.length > 200 ? `${desc.slice(0, 197)}...` : desc),
            includeThinking: supportsThinking,
            extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
        });
    }
    async generateImage(req, signal) {
        const model = normalizeImageModel(req.model) ?? DEFAULT_IMAGE_MODEL;
        const width = req.width ?? 1024;
        const height = req.height ?? 1024;
        const body = {
            prompt: req.prompt,
            width,
            height,
            sampling_steps: req.steps ?? 4,
            cfg_scale: 0,
            seed: req.seed ?? Math.floor(Math.random() * 2_147_483_647),
        };
        const parsed = await postJSON({
            url: `${IMAGE_GEN_BASE}/${model}`,
            apiKey: this.apiKey,
            body,
            providerName: this.id,
            signal,
            timeoutMs: IMAGE_GEN_TIMEOUT_MS,
        });
        const base64 = extractBase64(parsed);
        if (!base64) {
            throw new ProviderError('NVIDIA image response missing base64 payload', this.id);
        }
        return { base64, mimeType: 'image/png', model };
    }
}
function extractBase64(resp) {
    const first = resp.artifacts?.[0];
    if (first) {
        if (typeof first.base64 === 'string' && first.base64.length > 0)
            return first.base64;
        if (typeof first.b64_json === 'string' && first.b64_json.length > 0)
            return first.b64_json;
    }
    if (typeof resp.image === 'string' && resp.image.length > 0)
        return resp.image;
    if (Array.isArray(resp.images) && typeof resp.images[0] === 'string' && resp.images[0].length > 0) {
        return resp.images[0];
    }
    return undefined;
}
function normalizeImageModel(input) {
    if (!input)
        return undefined;
    const lower = input.toLowerCase();
    if (lower === 'flux.1-schnell' || lower === 'flux-schnell' || lower === 'nvidia/flux'
        || lower === 'flux' || lower === 'black-forest-labs/flux.1-schnell') {
        return DEFAULT_IMAGE_MODEL;
    }
    return input;
}
//# sourceMappingURL=nvidia.js.map