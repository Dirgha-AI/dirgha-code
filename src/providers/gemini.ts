/**
 * Google Gemini provider.
 *
 * Uses generativelanguage.googleapis.com v1beta with streamGenerateContent.
 * Gemini's wire format is JSON-array-over-SSE rather than delta
 * envelopes, so this adapter has its own ingest loop.
 */

import type { AgentEvent, ContentPart, ToolDefinition } from '../kernel/types.js';
import type { Provider, StreamRequest, ProviderConfig } from './iface.js';
import { ProviderError } from './iface.js';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements Provider {
  readonly id = 'gemini';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    if (!this.apiKey) throw new ProviderError('GEMINI_API_KEY or GOOGLE_API_KEY is required', this.id);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  supportsTools(_modelId: string): boolean {
    return true;
  }

  supportsThinking(modelId: string): boolean {
    return modelId.includes('thinking') || modelId.includes('2.5');
  }

  async *stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    const model = req.model.replace(/^(google|gemini)\//, '').replace(/^gemini-/, '');
    const url = `${this.baseUrl}/models/gemini-${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
    const body = buildGeminiBody(req);

    const { signal, cancel } = makeTimeoutSignal(this.timeoutMs, req.signal);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      cancel();
      throw new ProviderError(`Network error: ${String((err as Error)?.message ?? err)}`, this.id, undefined, true);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      cancel();
      throw new ProviderError(`HTTP ${response.status}: ${text}`, this.id, response.status, response.status >= 500 || response.status === 429);
    }
    if (!response.body) {
      cancel();
      throw new ProviderError('Empty response body', this.id);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let textOpen = false;
    let toolIndex = 0;

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
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let chunk: GeminiStreamChunk;
          try { chunk = JSON.parse(payload) as GeminiStreamChunk; } catch { continue; }
          const candidate = chunk.candidates?.[0];
          if (!candidate) continue;
          for (const part of candidate.content?.parts ?? []) {
            if (part.text) {
              if (!textOpen) { yield { type: 'text_start' }; textOpen = true; }
              yield { type: 'text_delta', delta: part.text };
            } else if (part.functionCall) {
              if (textOpen) { yield { type: 'text_end' }; textOpen = false; }
              const id = `fc-${toolIndex++}`;
              const name = part.functionCall.name;
              yield { type: 'toolcall_start', id, name };
              yield { type: 'toolcall_end', id, input: part.functionCall.args ?? {} };
            }
          }
          if (chunk.usageMetadata) {
            yield {
              type: 'usage',
              inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
              outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
              cachedTokens: chunk.usageMetadata.cachedContentTokenCount ?? 0,
            };
          }
        }
      }
      if (textOpen) yield { type: 'text_end' };
    } finally {
      cancel();
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  }
}

function makeTimeoutSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  const onExternal = () => controller.abort((external as AbortSignal).reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener('abort', onExternal, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternal);
    },
  };
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: unknown } }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

function buildGeminiBody(req: StreamRequest): Record<string, unknown> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string }> }> = [];
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;

  for (const msg of req.messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content as ContentPart[]).filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text').map(p => p.text).join('');
      systemInstruction = { parts: [{ text }] };
      continue;
    }
    const parts: Array<{ text?: string }> = [];
    const raw = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content } as ContentPart] : msg.content;
    for (const p of raw) {
      if (p.type === 'text') parts.push({ text: p.text });
      else if (p.type === 'tool_result') parts.push({ text: p.content });
    }
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }

  const body: Record<string, unknown> = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (req.tools && req.tools.length > 0) {
    body.tools = [{
      functionDeclarations: req.tools.map((t: ToolDefinition) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema ?? { type: 'object', properties: {} },
      })),
    }];
  }
  const generationConfig: Record<string, unknown> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.maxTokens !== undefined) generationConfig.maxOutputTokens = req.maxTokens;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  return body;
}
