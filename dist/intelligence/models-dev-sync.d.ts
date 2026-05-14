export interface ModelsDevModel {
    id: string;
    name: string;
    contextWindow: number;
    maxOutput: number;
    cost: {
        inputPerM: number;
        outputPerM: number;
        cacheReadPerM?: number;
        cacheWritePerM?: number;
    };
    capabilities: {
        tools: boolean;
        reasoning: boolean;
        attachments: boolean;
    };
    modalities: {
        input: string[];
        output: string[];
    };
}
export interface ModelsDevProvider {
    id: string;
    name: string;
    apiBase: string | null;
    envKeys: string[];
    docUrl?: string;
    models: ModelsDevModel[];
}
export interface ModelsDevCatalog {
    fetchedAt: string;
    providerCount: number;
    modelCount: number;
    providers: Record<string, ModelsDevProvider>;
}
/** Synchronous context window lookup. Returns undefined if model unknown. */
export declare function getContextWindowSync(modelId: string): number | undefined;
/** Synchronous max output lookup. Returns undefined if model unknown. */
export declare function getMaxOutputSync(modelId: string): number | undefined;
/** Call after getCatalogue() resolves to keep the sync map warm. */
export declare function populateSyncMap(catalog: ModelsDevCatalog): void;
export declare function fetchModelsDev(timeoutMs?: number): Promise<ModelsDevCatalog>;
export declare function readCache(): Promise<ModelsDevCatalog | null>;
export declare function writeCache(c: ModelsDevCatalog): Promise<void>;
export declare function getCatalogue(ttlMs?: number): Promise<ModelsDevCatalog>;
