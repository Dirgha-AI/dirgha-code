/**
 * Remote embedding adapter — POSTs to a user-configured HTTP endpoint.
 *
 * Wire format (request):  { "texts": ["..."] }
 * Wire format (response): { "vectors": [[...384], ...] }
 *
 * 30s timeout per request. 5xx are treated as transient failures and
 * propagate as Errors with a "transient" hint so callers can retry. 4xx
 * throw immediately with the server-supplied message — these are usually
 * config errors (wrong URL, bad auth) that won't fix themselves on retry.
 */
import type { EmbeddingAdapter } from "./iface.js";
export interface RemoteEmbedderOptions {
    endpoint: string;
    /** Optional bearer token. Sent as `Authorization: Bearer <token>`. */
    bearerToken?: string;
    /** Override the default 30s request timeout. */
    timeoutMs?: number;
    /** Override fetch (testing). */
    fetchImpl?: typeof fetch;
}
export declare class RemoteEmbedder implements EmbeddingAdapter {
    readonly provider: "remote";
    private readonly endpoint;
    private readonly bearerToken;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(opts: RemoteEmbedderOptions);
    available(): Promise<boolean>;
    embed(texts: string[]): Promise<number[][]>;
}
