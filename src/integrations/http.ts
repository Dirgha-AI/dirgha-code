/**
 * Shared HTTP helper for integration clients. Adds Bearer auth, typed
 * JSON parsing, and consistent error surfaces.
 */

export class IntegrationError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
    this.name = 'IntegrationError';
  }
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

export async function jsonRequest<T>(opts: RequestOptions): Promise<T> {
  const url = buildUrl(opts.baseUrl, opts.path, opts.query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new IntegrationError(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  clearTimeout(timer);
  if (!response.ok) {
    const body = await safeJson(response);
    throw new IntegrationError(`HTTP ${response.status} ${response.statusText}`, response.status, body);
  }
  return (await response.json()) as T;
}

export async function sseRequest(opts: RequestOptions): Promise<AsyncIterable<string>> {
  const url = buildUrl(opts.baseUrl, opts.path, opts.query);
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    ...opts.headers,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  // Wire a timeout controller so hung SSE connections don't block forever.
  // Default 60 s; caller can shorten or lengthen via timeoutMs.
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`SSE request timed out after ${timeoutMs}ms`)), timeoutMs);
  // Chain any caller-provided signal so Ctrl+C / AbortController still works.
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort((opts.signal as AbortSignal).reason), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new IntegrationError(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    clearTimeout(timer);
    throw new IntegrationError(`HTTP ${response.status} ${response.statusText}`, response.status);
  }
  if (!response.body) {
    clearTimeout(timer);
    throw new IntegrationError('No response body on SSE');
  }

  return (async function* sseIterator(): AsyncIterable<string> {
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const raw = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
          if (line.startsWith('data:')) yield line.slice(5).trim();
        }
      }
    } finally {
      clearTimeout(timer);
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  })();
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function safeJson(r: Response): Promise<unknown> {
  try { return await r.json(); } catch {
    try { return await r.text(); } catch { return undefined; }
  }
}
