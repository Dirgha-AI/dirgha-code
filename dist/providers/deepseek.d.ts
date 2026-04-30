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
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
export declare const DEEPSEEK_MODELS: Array<{
    id: string;
    label: string;
}>;
export declare class DeepSeekProvider implements Provider {
    readonly id = "deepseek";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config?: ProviderConfig);
    supportsTools(): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
