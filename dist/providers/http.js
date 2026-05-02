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
import { ProviderError } from "./iface.js";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_STALL_TIMEOUT_MS = 30_000;
function buildSseHeaders(apiKey, hasBody, extra) {
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
    };
    if (hasBody)
        headers["Content-Type"] = "application/json";
    if (extra) {
        for (const [k, v] of Object.entries(extra)) {
            const lower = k.toLowerCase();
            if (lower === "accept" || lower === "content-type")
                continue;
            headers[k] = v;
        }
    }
    return headers;
}
function buildJsonHeaders(apiKey, hasBody, extra) {
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
    };
    if (hasBody)
        headers["Content-Type"] = "application/json";
    if (extra) {
        for (const [k, v] of Object.entries(extra)) {
            const lower = k.toLowerCase();
            if (lower === "accept" || lower === "content-type")
                continue;
            headers[k] = v;
        }
    }
    return headers;
}
function linkedSignal(timeoutMs, external) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    const onExternal = () => controller.abort(external.reason);
    if (external) {
        if (external.aborted)
            controller.abort(external.reason);
        else
            external.addEventListener("abort", onExternal, { once: true });
    }
    return {
        signal: controller.signal,
        cancel: () => {
            clearTimeout(timer);
            if (external)
                external.removeEventListener("abort", onExternal);
        },
    };
}
/**
 * POST a body and yield `data: ...` payload strings from a Server-Sent
 * Events response body. Does not attempt JSON parsing; the caller owns
 * per-provider payload semantics.
 */
export async function* streamSSE(req) {
    const hasBody = req.body !== undefined && req.body !== null;
    const headers = buildSseHeaders(req.apiKey, hasBody, req.extraHeaders);
    const { signal, cancel } = linkedSignal(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal);
    let response;
    try {
        response = await fetch(req.url, {
            method: "POST",
            headers,
            body: hasBody ? JSON.stringify(req.body) : undefined,
            signal,
        });
    }
    catch (err) {
        cancel();
        const msg = err?.message ?? String(err);
        const hint = /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
            ? ` — check your internet connection (target: ${req.url})`
            : '';
        throw new ProviderError(`Network error: ${msg}${hint}`, req.providerName, undefined, true);
    }
    if (!response.ok) {
        const text = await safeReadText(response);
        cancel();
        throw new ProviderError(`HTTP ${response.status} ${response.statusText}: ${text}`, req.providerName, response.status, isRetryableStatus(response.status));
    }
    if (!response.body) {
        cancel();
        throw new ProviderError("Empty response body", req.providerName);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const stallMs = req.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    let stallTimer;
    try {
        for (;;) {
            stallTimer = undefined;
            let result;
            if (stallMs > 0) {
                result = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => {
                        stallTimer = setTimeout(() => reject(new Error(`Stream stalled: no bytes received in ${stallMs}ms`)), stallMs);
                    }),
                ]);
            }
            else {
                result = await reader.read();
            }
            if (stallTimer !== undefined)
                clearTimeout(stallTimer);
            const { value, done } = result;
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
                const rawLine = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
                if (line.length === 0)
                    continue;
                if (line.startsWith(":"))
                    continue;
                if (!line.startsWith("data:"))
                    continue;
                const payload = line.slice(5).trim();
                if (payload.length === 0)
                    continue;
                yield payload;
            }
        }
        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
            const payload = tail.slice(5).trim();
            if (payload.length > 0)
                yield payload;
        }
    }
    finally {
        cancel();
        try {
            reader.releaseLock();
        }
        catch {
            /* noop */
        }
    }
}
/**
 * One-shot JSON POST. Returns the parsed body. Use only for non-streaming
 * endpoints; streaming completions must go through streamSSE to preserve
 * token-level event fidelity.
 */
export async function postJSON(req) {
    const hasBody = req.body !== undefined && req.body !== null;
    const headers = buildJsonHeaders(req.apiKey, hasBody, req.extraHeaders);
    const { signal, cancel } = linkedSignal(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal);
    let response;
    try {
        response = await fetch(req.url, {
            method: "POST",
            headers,
            body: hasBody ? JSON.stringify(req.body) : undefined,
            signal,
        });
    }
    catch (err) {
        cancel();
        const msg = err?.message ?? String(err);
        const hint = /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
            ? ` — check your internet connection (target: ${req.url})`
            : '';
        throw new ProviderError(`Network error: ${msg}${hint}`, req.providerName, undefined, true);
    }
    if (!response.ok) {
        const text = await safeReadText(response);
        cancel();
        throw new ProviderError(`HTTP ${response.status} ${response.statusText}: ${text}`, req.providerName, response.status, isRetryableStatus(response.status));
    }
    const parsed = (await response.json());
    cancel();
    return parsed;
}
async function safeReadText(response) {
    try {
        return await response.text();
    }
    catch {
        return "<body unreadable>";
    }
}
function isRetryableStatus(status) {
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
}
//# sourceMappingURL=http.js.map