/**
 * Google Gemini provider.
 *
 * Uses generativelanguage.googleapis.com v1beta with streamGenerateContent.
 * Gemini's wire format is JSON-array-over-SSE rather than delta
 * envelopes, so this adapter has its own ingest loop.
 */
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
export declare class GeminiProvider implements Provider {
    readonly id = "gemini";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config: ProviderConfig);
    supportsTools(_modelId: string): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
