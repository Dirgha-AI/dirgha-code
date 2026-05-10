import type { AgentEvent } from "../kernel/types.js";
import type { Provider, StreamRequest } from "./iface.js";
/** Configuration entry loaded from ~/.dirgha/providers.json */
export interface CustomProviderEntry {
    id: string;
    label: string;
    baseUrl: string;
    apiKey?: string;
    models?: string[];
    supportsTools?: boolean;
    supportsThinking?: boolean;
    timeoutMs?: number;
    stallTimeoutMs?: number;
}
/** Runtime provider that talks to any OpenAI‑compatible server */
export declare class CustomProvider implements Provider {
    readonly id: string;
    readonly entry: CustomProviderEntry;
    constructor(entry: CustomProviderEntry);
    supportsTools(): boolean;
    supportsThinking(): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
}
/**
 * Read the user‑level providers file and instantiate a map of
 * CustomProvider objects.  Failures (file missing, parse error, …)
 * are silently swallowed – an empty Map is returned.
 */
export declare function loadCustomProviders(): Map<string, CustomProvider>;
/** Singleton provider map, populated once at module load */
export declare const CUSTOM_PROVIDERS: Map<string, CustomProvider>;
