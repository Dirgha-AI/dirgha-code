/**
 * Fireworks provider — https://fireworks.ai
 *
 * OpenAI-compatible endpoint. Supports tool calling. Thinking (reasoning)
 * is not currently exposed by Fireworks' API for chat completions but
 * may be added in a future update.
 */
import type { AgentEvent } from "../kernel/types.js";
import type { Provider, StreamRequest, ProviderConfig } from "./iface.js";
export declare class FireworksProvider implements Provider {
    readonly id = "fireworks";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config: ProviderConfig);
    supportsTools(_modelId: string): boolean;
    supportsThinking(_modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
