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
/// <reference types="node" resolution-mode="require"/>
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig, ImageGenRequest, ImageGenResult } from './iface.js';
export declare class NvidiaProvider implements Provider {
    readonly id = "nvidia";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config: ProviderConfig);
    supportsTools(modelId: string): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
    generateImage(req: ImageGenRequest, signal?: AbortSignal): Promise<ImageGenResult>;
}
