/**
 * Shared HTTP helper for integration clients. Adds Bearer auth, typed
 * JSON parsing, and consistent error surfaces.
 */
export declare class IntegrationError extends Error {
    readonly status?: number | undefined;
    readonly body?: unknown | undefined;
    constructor(message: string, status?: number | undefined, body?: unknown | undefined);
}
export interface RequestOptions {
    baseUrl: string;
    path: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    token?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export declare function jsonRequest<T>(opts: RequestOptions): Promise<T>;
export declare function sseRequest(opts: RequestOptions): Promise<AsyncIterable<string>>;
