/**
 * OpenRouter provider. OpenAI-compatible, with three conveniences:
 *   - Includes the free tier Ling model used for code generation.
 *   - Emits provider-identifying headers that the OpenRouter console
 *     surfaces (HTTP-Referer, X-Title).
 *   - Supports free-tier models via the ":free" suffix.
 */
import type { AgentEvent } from "../kernel/types.js";
import type { Provider, StreamRequest, ProviderConfig } from "./iface.js";
export declare class OpenRouterProvider implements Provider {
    readonly id = "openrouter";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly appName;
    private readonly appUrl;
    constructor(config: ProviderConfig & {
        appName?: string;
        appUrl?: string;
    });
    supportsTools(modelId: string): boolean;
    supportsThinking(modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
