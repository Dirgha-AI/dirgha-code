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
import { assertSafeFetchUrl } from "../utils/url-guard.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface RemoteEmbedderOptions {
  endpoint: string;
  /** Optional bearer token. Sent as `Authorization: Bearer <token>`. */
  bearerToken?: string;
  /** Override the default 30s request timeout. */
  timeoutMs?: number;
  /** Override fetch (testing). */
  fetchImpl?: typeof fetch;
}

interface RemoteResponse {
  vectors?: number[][];
}

export class RemoteEmbedder implements EmbeddingAdapter {
  readonly provider = "remote" as const;
  private readonly endpoint: string;
  private readonly bearerToken: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RemoteEmbedderOptions) {
    if (!opts.endpoint || typeof opts.endpoint !== "string") {
      throw new Error("RemoteEmbedder: endpoint is required");
    }
    this.endpoint = opts.endpoint;
    this.bearerToken = opts.bearerToken;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async available(): Promise<boolean> {
    // We don't ping in available() — that would add a ~RTT latency on every
    // call. We only assert the endpoint string is non-empty; the next
    // embed() will surface real connectivity issues with a clear error.
    return Boolean(this.endpoint);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error("embed(): texts must be an array");
    }
    if (texts.length === 0) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (this.bearerToken) {
        headers["Authorization"] = `Bearer ${this.bearerToken}`;
      }
      assertSafeFetchUrl(this.endpoint);
      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ texts }),
        signal: controller.signal,
      });

      if (res.status >= 500) {
        const body = await safeText(res);
        const err = new Error(
          `RemoteEmbedder: transient ${res.status} from ${this.endpoint}: ${body}`,
        ) as Error & { transient?: boolean };
        err.transient = true;
        throw err;
      }
      if (!res.ok) {
        const body = await safeText(res);
        throw new Error(
          `RemoteEmbedder: ${res.status} from ${this.endpoint}: ${body}`,
        );
      }

      const json = (await res.json()) as RemoteResponse;
      if (!json || !Array.isArray(json.vectors)) {
        throw new Error(
          "RemoteEmbedder: malformed response — missing vectors[][]",
        );
      }
      if (json.vectors.length !== texts.length) {
        throw new Error(
          `RemoteEmbedder: vector count mismatch — sent ${texts.length}, got ${json.vectors.length}`,
        );
      }
      return json.vectors;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
