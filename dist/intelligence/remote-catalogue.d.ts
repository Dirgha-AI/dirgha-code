/**
 * Live model catalogue sync.
 *
 * Fetches the live model catalogue from api.dirgha.ai on startup,
 * caches to disk (~/.dirgha/models-cache.json), refreshes every 6 hours.
 * Falls back to the hardcoded catalogues if the API is unreachable.
 */
export interface RemoteModelDescriptor {
    id: string;
    label: string;
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    tools: boolean;
    vision: boolean;
    thinkingMode: string;
    inputPerM: number;
    outputPerM: number;
    cachedInputPerM?: number;
    free: boolean;
    recommended: boolean;
    tags: string[];
}
export interface ModelsCache {
    fetchedAt: string;
    provider: string;
    models: RemoteModelDescriptor[];
}
export declare function fetchRemoteCatalogue(): Promise<RemoteModelDescriptor[]>;
export declare function loadCatalogue(): Promise<RemoteModelDescriptor[]>;
export declare function getCachedCatalogue(): RemoteModelDescriptor[] | null;
