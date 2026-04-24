/**
 * providers/http.ts — Shared HTTP utilities for provider APIs
 */
import type { SSEResult } from './types.js';
import type { ContentBlock } from '../types.js';
export { normaliseOpenAI } from './normalise.js';

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
): Promise<{ usage: { prompt_tokens: number; completion_tokens: number } | null; toolUseBlocks: ContentBlock[] }> {
  return streamSSE(url, headers, body, onChunk);
}

/** Stateful splitter: routes <think>...</think> content away from onText */
class ThinkSplitter {
  private inThink = false;
  private buf = '';

  process(chunk: string, onText: (t: string) => void, onThinking: (t: string) => void): void {
    const text = this.buf + chunk;
    this.buf = '';
    let i = 0;
    while (i < text.length) {
      if (this.inThink) {
        const end = text.indexOf('</think>', i);
        if (end !== -1) {
          if (end > i) onThinking(text.slice(i, end));
          this.inThink = false;
          i = end + 8;
        } else {
          const safe = this.safeCut(text, i, '</think>');
          if (safe > i) onThinking(text.slice(i, safe));
          this.buf = text.slice(safe);
          return;
        }
      } else {
        const start = text.indexOf('<think>', i);
        if (start !== -1) {
          if (start > i) onText(text.slice(i, start));
          this.inThink = true;
          i = start + 7;
        } else {
          const safe = this.safeCut(text, i, '<think>');
          if (safe > i) onText(text.slice(i, safe));
          this.buf = text.slice(safe);
          return;
        }
      }
    }
  }

  private safeCut(text: string, from: number, tag: string): number {
    const sub = text.slice(from);
    for (let len = Math.min(tag.length - 1, sub.length); len > 0; len--) {
      if (tag.startsWith(sub.slice(sub.length - len))) return from + sub.length - len;
    }
    return from + sub.length;
  }
}

/** Stream SSE and collect tool blocks + usage */
export async function streamSSE(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onText: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<{ usage: { prompt_tokens: number; completion_tokens: number } | null; toolUseBlocks: ContentBlock[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      // Accept declares what the SERVER should send — text/event-stream for SSE.
      // Content-Type declares what the CLIENT is sending — application/json (body).
      // Passing Accept: application/json on a streaming NIM request breaks SSE
      // negotiation and produces stutter. Caller can override by supplying
      // its own Accept, but the default here matches the channel.
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...(body as object), stream: true }),
      signal: controller.signal,
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
    const indexToId = new Map<number, string>();
    const splitter = onThinking ? new ThinkSplitter() : null;

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
          if (delta.content) {
            if (splitter) splitter.process(delta.content, onText, onThinking!);
            else onText(delta.content);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              let id = tc.id;
              if (id) {
                indexToId.set(index, id);
              } else {
                id = indexToId.get(index);
              }

              if (!id) {
                id = `tc-${index}`;
                indexToId.set(index, id);
              }

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
  } finally {
    clearTimeout(timeoutId);
  }
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

/**
 * Stream Anthropic-format SSE. Returns an AsyncGenerator of events.
 */
export async function* streamAnthropic(
  url: string,
  headers: Record<string, string>,
  payload: any,
): AsyncGenerator<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    });

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
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          yield data;
        } catch {
          /* ignore malformed SSE */
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
