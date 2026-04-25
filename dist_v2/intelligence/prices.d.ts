/**
 * Price catalogue. USD per million tokens. Update quarterly.
 * When a model is not listed, the cost tracker falls back to 0.
 */
export interface PricePoint {
    provider: string;
    model: string;
    inputPerM: number;
    outputPerM: number;
    cachedInputPerM?: number;
    /** Maximum input tokens the model accepts in a single request. */
    contextWindow?: number;
    /** Maximum output tokens per response. */
    maxOutput?: number;
    /** True if the model can call functions / tools. Defaults via provider preset. */
    supportsTools?: boolean;
    /** True if the model surfaces a separate "thinking" / reasoning channel. */
    supportsThinking?: boolean;
    /** Free-text family for grouping in the picker (`gpt`, `claude`, `kimi`, …). */
    family?: string;
}
export declare const PRICES: PricePoint[];
export declare function findPrice(provider: string, model: string): PricePoint | undefined;
/**
 * Single-source-of-truth lookup. Returns the full PricePoint for a
 * model id (provider-agnostic — model ids are unique across providers
 * in our catalogue). Pair with `contextWindowFor(id)` (which adds
 * a fallback default) when you only need the context limit.
 */
export declare function lookupModel(modelId: string): PricePoint | undefined;
/**
 * All models grouped by their `family` field (or by inferred family
 * from the model id when unset). Powers the model picker + the
 * `dirgha models info` subcommand. Mutating the returned map does not
 * affect PRICES.
 */
export declare function modelsByFamily(): Map<string, PricePoint[]>;
/**
 * Best-effort lookup of the context-window cap for a model id. Searches
 * across all providers since model ids in this catalogue are unique
 * enough to disambiguate. Returns undefined when the model is unknown
 * (caller should fall back to a conservative default like 32k).
 */
export declare function findContextWindow(modelId: string): number | undefined;
/**
 * Per-model context-window catalogue. Numbers come from each provider's
 * published spec sheet (cross-checked against models.dev). When we add
 * a new model id to PRICES, also add its window here so context-aware
 * compaction has a real cap to compare against. Models not listed fall
 * back to DEFAULT_CONTEXT_WINDOW at runtime.
 */
export declare const DEFAULT_CONTEXT_WINDOW = 32000;
export declare function contextWindowFor(modelId: string): number;
export declare function findFailover(modelId: string): string | undefined;
export declare function resolveModelAlias(input: string): string;
export declare function listModelAliases(): Array<{
    alias: string;
    model: string;
}>;
