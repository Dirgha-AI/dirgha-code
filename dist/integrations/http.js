/**
 * Shared HTTP helper for integration clients. Adds Bearer auth, typed
 * JSON parsing, and consistent error surfaces.
 */
export class IntegrationError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = 'IntegrationError';
    }
}
export async function jsonRequest(opts) {
    const url = buildUrl(opts.baseUrl, opts.path, opts.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    if (opts.signal)
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    const headers = {
        Accept: 'application/json',
        ...opts.headers,
    };
    if (opts.token)
        headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined)
        headers['Content-Type'] = 'application/json';
    let response;
    try {
        response = await fetch(url, {
            method: opts.method ?? 'GET',
            headers,
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
            signal: controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timer);
        throw new IntegrationError(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(timer);
    if (!response.ok) {
        const body = await safeJson(response);
        throw new IntegrationError(`HTTP ${response.status} ${response.statusText}`, response.status, body);
    }
    return (await response.json());
}
export async function sseRequest(opts) {
    const url = buildUrl(opts.baseUrl, opts.path, opts.query);
    const headers = {
        Accept: 'text/event-stream',
        ...opts.headers,
    };
    if (opts.token)
        headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined)
        headers['Content-Type'] = 'application/json';
    const response = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
    });
    if (!response.ok) {
        throw new IntegrationError(`HTTP ${response.status} ${response.statusText}`, response.status);
    }
    if (!response.body)
        throw new IntegrationError('No response body on SSE');
    return (async function* sseIterator() {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const raw = buffer.slice(0, nl);
                buffer = buffer.slice(nl + 1);
                const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
                if (line.startsWith('data:'))
                    yield line.slice(5).trim();
            }
        }
    })();
}
function buildUrl(base, path, query) {
    const url = new URL(path.startsWith('http') ? path : `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v === undefined)
                continue;
            url.searchParams.set(k, String(v));
        }
    }
    return url.toString();
}
async function safeJson(r) {
    try {
        return await r.json();
    }
    catch {
        try {
            return await r.text();
        }
        catch {
            return undefined;
        }
    }
}
//# sourceMappingURL=http.js.map