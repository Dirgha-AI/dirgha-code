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
import { assertSafeFetchUrlAsync } from "../utils/url-guard.js";
const DEFAULT_TIMEOUT_MS = 30_000;
export class RemoteEmbedder {
    provider = "remote";
    endpoint;
    bearerToken;
    timeoutMs;
    fetchImpl;
    constructor(opts) {
        if (!opts.endpoint || typeof opts.endpoint !== "string") {
            throw new Error("RemoteEmbedder: endpoint is required");
        }
        this.endpoint = opts.endpoint;
        this.bearerToken = opts.bearerToken;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    }
    async available() {
        // We don't ping in available() — that would add a ~RTT latency on every
        // call. We only assert the endpoint string is non-empty; the next
        // embed() will surface real connectivity issues with a clear error.
        return Boolean(this.endpoint);
    }
    async embed(texts) {
        if (!Array.isArray(texts)) {
            throw new Error("embed(): texts must be an array");
        }
        if (texts.length === 0)
            return [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const headers = {
                "Content-Type": "application/json",
                Accept: "application/json",
            };
            if (this.bearerToken) {
                headers["Authorization"] = `Bearer ${this.bearerToken}`;
            }
            await assertSafeFetchUrlAsync(this.endpoint);
            const res = await this.fetchImpl(this.endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({ texts }),
                redirect: "manual",
                signal: controller.signal,
            });
            if (res.status >= 500) {
                const body = await safeText(res);
                const err = new Error(`RemoteEmbedder: transient ${res.status} from ${this.endpoint}: ${body}`);
                err.transient = true;
                throw err;
            }
            if (!res.ok) {
                const body = await safeText(res);
                throw new Error(`RemoteEmbedder: ${res.status} from ${this.endpoint}: ${body}`);
            }
            const json = (await res.json());
            if (!json || !Array.isArray(json.vectors)) {
                throw new Error("RemoteEmbedder: malformed response — missing vectors[][]");
            }
            if (json.vectors.length !== texts.length) {
                throw new Error(`RemoteEmbedder: vector count mismatch — sent ${texts.length}, got ${json.vectors.length}`);
            }
            return json.vectors;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
async function safeText(res) {
    try {
        return (await res.text()).slice(0, 500);
    }
    catch {
        return "<no body>";
    }
}
//# sourceMappingURL=remote.js.map