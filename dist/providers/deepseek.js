/**
 * DeepSeek native provider — direct against api.deepseek.com.
 *
 * Why direct (vs routing via OpenRouter)?
 *   - Own quota, no shared free-tier 429s.
 *   - Native cache discount (~10% on hits) surfaces directly in usage.
 *   - Cheaper than OpenRouter for steady-state DeepSeek workloads.
 *
 * Wire protocol is OpenAI-compat, so we delegate to streamChatCompletions
 * the same way openai.ts and nvidia.ts do. Model IDs use the bare
 * `deepseek-chat` / `deepseek-reasoner` family — DeepSeek's own
 * canonical ids. Vendor-prefixed ids like `deepseek/deepseek-v4-flash`
 * (an OpenRouter routing slug) still go through the OR provider unless
 * the user explicitly forces DIRGHA_PROVIDER=deepseek.
 */
import { ProviderError } from './iface.js';
import { streamChatCompletions } from './openai-compat.js';
const DEFAULT_BASE = 'https://api.deepseek.com/v1';
// Canonical model IDs served by api.deepseek.com as of 2026-04.
// deepseek-chat   = V3/V4 (flagship, general purpose)
// deepseek-v4-flash = lightweight fast variant
// deepseek-v4-pro   = full MoE, best quality
// deepseek-reasoner = R1 (thinking/chain-of-thought)
// deepseek-prover-v2 = math/theorem proving
export const DEEPSEEK_MODELS = [
    { id: 'deepseek-chat', label: 'DeepSeek V3 (default)' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (fast)' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (max quality)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoning)' },
    { id: 'deepseek-prover-v2', label: 'DeepSeek Prover V2 (math)' },
];
// Models that surface a reasoning/thinking channel.
const THINKING_MODELS = new Set([
    'deepseek-reasoner',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-r1',
    'deepseek-prover-v2',
]);
export class DeepSeekProvider {
    id = 'deepseek';
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(config = {}) {
        this.apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
        if (!this.apiKey)
            throw new ProviderError('DEEPSEEK_API_KEY is required', this.id);
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        // Reasoning models can take 30–60 s on first-token. Match OpenRouter's
        // headroom so multi-turn coding sprints don't cancel themselves.
        this.timeoutMs = config.timeoutMs ?? 300_000;
    }
    supportsTools() {
        return true;
    }
    supportsThinking(modelId) {
        const base = modelId.replace(/^deepseek(?:-ai)?\//, '');
        return THINKING_MODELS.has(base);
    }
    stream(req) {
        // Strip OR-style or vendor prefixes — the native API uses bare IDs.
        const model = req.model.replace(/^deepseek(?:-ai)?\//, '');
        return streamChatCompletions({
            providerName: this.id,
            endpoint: `${this.baseUrl}/chat/completions`,
            apiKey: this.apiKey,
            model,
            messages: req.messages,
            tools: this.supportsTools() ? req.tools : undefined,
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            timeoutMs: this.timeoutMs,
            signal: req.signal,
            includeThinking: this.supportsThinking(req.model) && req.thinking !== 'off',
        });
    }
}
//# sourceMappingURL=deepseek.js.map