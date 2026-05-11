/**
 * Dirgha gateway provider.
 *
 * Uses the device-code auth token from ~/.dirgha/credentials.json to
 * call the Dirgha gateway (api.dirgha.ai) which proxies to OpenRouter.
 * This gives signed-in users access to all 300+ OpenRouter models without
 * managing their own OPENROUTER_API_KEY.
 *
 * Falls back to OPENROUTER_API_KEY env var when no token is found,
 * so BYOK users still work through the same code path.
 */
import type { AgentEvent } from "../kernel/types.js";
import type { Provider, StreamRequest, ProviderConfig } from "./iface.js";
export declare class DirghaProvider implements Provider {
    readonly id = "dirgha";
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(config?: ProviderConfig);
    /** Resolve the bearer token: auth token first, then env var. */
    private resolveApiKey;
    supportsTools(_modelId: string): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
