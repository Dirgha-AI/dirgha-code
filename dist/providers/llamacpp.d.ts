/**
 * llama.cpp provider — local model runtime via llama-server's
 * OpenAI-compatible /v1/chat/completions endpoint. Default port 8080.
 * Override with LLAMACPP_URL env var or config.baseUrl.
 */
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
export declare class LlamaCppProvider implements Provider {
    readonly id = "llamacpp";
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config: ProviderConfig);
    supportsTools(_modelId: string): boolean;
    supportsThinking(_modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
