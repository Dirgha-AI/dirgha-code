/**
 * Fireworks provider. Kept for back-compat routing only — the upstream
 * plan that fronted this provider is wound down and the default router
 * no longer uses it. The adapter still exists so existing session
 * transcripts that reference fireworks/* model ids remain decodable.
 */
import type { AgentEvent } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
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
