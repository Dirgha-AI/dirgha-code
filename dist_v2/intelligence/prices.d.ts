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
}
export declare const PRICES: PricePoint[];
export declare function findPrice(provider: string, model: string): PricePoint | undefined;
