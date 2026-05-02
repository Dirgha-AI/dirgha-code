/**
 * OpenAI provider (native /chat/completions over the api.openai.com host).
 * Thin wrapper; most logic lives in the shared openai-compat adapter.
 */
/// <reference types="node" resolution-mode="require"/>
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig, ImageGenRequest, ImageGenResult } from './iface.js';
export declare class OpenAIProvider implements Provider {
    readonly id = "openai";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly organization?;
    constructor(config: ProviderConfig & {
        organization?: string;
    });
    supportsTools(modelId: string): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
    generateImage(req: ImageGenRequest, signal?: AbortSignal): Promise<ImageGenResult>;
}
