/**
 * Ollama provider — local model runtime. Uses OpenAI-compatible
 * /v1/chat/completions endpoint exposed by recent Ollama versions.
 */
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
export declare class OllamaProvider implements Provider {
    readonly id = "ollama";
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config: ProviderConfig);
    supportsTools(_modelId: string): boolean;
    supportsThinking(_modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
