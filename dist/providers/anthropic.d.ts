/**
 * Anthropic provider. Uses the Messages API (/v1/messages) with its own
 * SSE event shape (content_block_start, content_block_delta,
 * content_block_stop, message_delta, message_stop). Event-to-kernel
 * mapping is bespoke; it does not share the openai-compat adapter.
 */
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
export declare class AnthropicProvider implements Provider {
    readonly id = "anthropic";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly version;
    private readonly timeoutMs;
    constructor(config: ProviderConfig & {
        version?: string;
    });
    supportsTools(_modelId: string): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
