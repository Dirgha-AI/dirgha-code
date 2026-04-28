/**
 * Provider runtime types. The Provider contract lives in kernel/types.ts
 * (all layers need it). This module adds the runtime-only pieces:
 * configuration objects and the typed error class.
 */
export type { Provider, StreamRequest, ImageGenRequest, ImageGenResult, } from '../kernel/types.js';
export interface ProviderConfig {
    apiKey?: string;
    baseUrl?: string;
    extraHeaders?: Record<string, string>;
    timeoutMs?: number;
}
export declare class ProviderError extends Error {
    readonly provider: string;
    readonly status?: number | undefined;
    readonly retryable: boolean;
    constructor(message: string, provider: string, status?: number | undefined, retryable?: boolean);
}
