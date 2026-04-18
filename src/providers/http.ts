/**
 * providers/http.ts — Shared HTTP utilities for provider APIs
 */
import type { SSEResult } from './types.js';
import type { ContentBlock } from '../types.js';
export { normaliseOpenAI } from './normalise.js';

/**
 * On HTTP 401 from the dirgha gateway (identifiable by the Authorization
 * header containing a `dirgha_cli_*` token), delete the local credentials
 * so the next invocation prompts the user to re-login. Prevents the "my
 * token was revoked but the CLI keeps using it" bug the audit flagged.
 * Idempotent — safe to call on every 401.
 */
async function handleGatewayUnauthorized(url: string, headers: Record<string, string>): Promise<void> {
  const auth = headers['Authorization'] ?? headers['authorization'] ?? '';
  if (!auth.startsWith('Bearer dirgha_cli_')) return; // BYOK path — don't touch their creds
  try {
    const { clearCredentials } = await import('../utils/credentials.js');
    clearCredentials();
    // Intentionally write to stderr, not a thrown error that could mask the
    // original 401 for the caller. The caller still throws; we just make
    // sure the next CLI invocation doesn't silently reuse the dead token.
    process.stderr.write(
      '\n[auth] Gateway rejected your token (401). Credentials cleared — run `dirgha login` to get a new one.\n'
    );
  } catch { /* best effort */ }
}

export async function postJSON(url: string, headers: Record<string, string>, body: unknown, timeout?: number): Promise<any> {
  const controller = timeout ? new AbortController() : undefined;
  const timeoutId = (controller && timeout) ? setTimeout(() => controller.abort(), timeout) : undefined;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    const text = await res.text();
    if (res.status === 401) await handleGatewayUnauthorized(url, headers);
    if (!res.ok) throw new Error(`${url} ${res.status}: ${text}`);

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${url}: invalid JSON response`);
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function streamJSON(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...(body as object), stream: true }),
  });
  if (res.status === 401) await handleGatewayUnauthorized(url, headers);

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`${url} ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      const parsed = parseSSEChunk(raw);
      if (parsed === null) continue;
      if (parsed.text) onChunk(parsed.text);
    }
  }
}

/** Stream SSE and collect tool blocks + usage */
export async function streamSSE(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onText: (text: string) => void,
): Promise<{ usage: { prompt_tokens: number; completion_tokens: number } | null; toolUseBlocks: ContentBlock[] }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...(body as object), stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`${url} ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
  const toolCallAccum = new Map<string, { id: string; name: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const data = JSON.parse(raw);
        if (data?.usage) usage = data.usage;
        const delta = data?.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) onText(delta.content);
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const id = tc.id || `tc-${toolCallAccum.size}`;
            const existing = toolCallAccum.get(id) ?? { id, name: tc.function?.name ?? '', args: '' };
            existing.args += tc.function?.arguments ?? '';
            if (tc.function?.name) existing.name = tc.function.name;
            toolCallAccum.set(id, existing);
          }
        }
      } catch { /* ignore malformed SSE */ }
    }
  }

  const toolUseBlocks: ContentBlock[] = Array.from(toolCallAccum.values()).map(tc => ({
    type: 'tool_use',
    id: tc.id,
    name: tc.name,
    input: (() => { try { return JSON.parse(tc.args || '{}'); } catch { return {}; } })(),
  }));

  return { usage, toolUseBlocks };
}

export function parseSSEChunk(raw: string): SSEResult {
  if (raw === '[DONE]') return null;
  try {
    const data = JSON.parse(raw);
    const delta = data?.choices?.[0]?.delta;
    if (!delta) return { text: null, toolCall: null };

    if (delta.tool_calls?.length) {
      const tc = delta.tool_calls[0];
      return {
        text: null,
        toolCall: { id: tc.id ?? '', name: tc.function?.name ?? '', args: tc.function?.arguments ?? '' },
      };
    }
    return { text: delta.content ?? null, toolCall: null };
  } catch {
    return { text: null, toolCall: null };
  }
}
