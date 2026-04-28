/**
 * Single-port HTTP server that serves scripted SSE responses for the
 * OpenAI-compatible dialect. Used by the parity harness to drive the
 * real provider adapters against deterministic fixtures.
 */
export interface MockResponse {
    chunks: string[];
    headers?: Record<string, string>;
    status?: number;
}
export interface MockServer {
    readonly url: string;
    close(): Promise<void>;
}
export declare function startMockOpenAICompat(queue: MockResponse[]): Promise<MockServer>;
