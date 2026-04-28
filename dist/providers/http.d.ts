/**
 * Canonical HTTP helpers for provider adapters.
 *
 * The NVIDIA streaming stutter root cause was header duplication: the
 * previous implementation added Content-Type: application/json alongside
 * Accept: application/json, which breaks NIM's SSE response negotiation.
 * Two invariants enforced here eliminate that class of bug:
 *
 *   (i)  Accept declares what the SERVER returns. For SSE streams we
 *        request text/event-stream; for JSON RPC we request application/
 *        json. Never both.
 *   (ii) Content-Type declares what the CLIENT is sending. It is only
 *        attached when there is a body, and only as application/json.
 *
 * All provider adapters route through streamSSE or postJSON. No adapter
 * sets Accept or Content-Type directly; extraHeaders is for custom
 * provider-specific keys (e.g., organisation id) only.
 */
export interface SseRequest {
    url: string;
    apiKey: string;
    body: unknown;
    extraHeaders?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
    providerName: string;
}
export interface JsonRequest extends SseRequest {
}
/**
 * POST a body and yield `data: ...` payload strings from a Server-Sent
 * Events response body. Does not attempt JSON parsing; the caller owns
 * per-provider payload semantics.
 */
export declare function streamSSE(req: SseRequest): AsyncIterable<string>;
/**
 * One-shot JSON POST. Returns the parsed body. Use only for non-streaming
 * endpoints; streaming completions must go through streamSSE to preserve
 * token-level event fidelity.
 */
export declare function postJSON<T>(req: JsonRequest): Promise<T>;
