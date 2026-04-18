/**
 * models/providers/litellm-unified.ts — Unified provider via LiteLLM proxy
 * 
 * This is the PRIMARY provider that routes to 100+ models via LiteLLM.
 * All other providers are fallbacks for direct API access.
 */
import { postJSON, streamJSON } from '../../providers/http.js';
import type { 
  ChatRequest, 
  ChatResponse, 
  StreamChunk, 
  ContentBlock,
  ProviderConfig,
  UnifiedProvider 
} from '../types.js';

export interface LiteLLMConfig extends ProviderConfig {
  baseUrl: string;
  virtualKey?: string;
}

export class LiteLLMUnifiedProvider implements UnifiedProvider {
  name = 'litellm-unified';
  private config: LiteLLMConfig;

  constructor(config: LiteLLMConfig) {
    this.config = {
      timeout: 120000,
      retries: 3,
      ...config,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const payload = this.buildPayload(request);
    const headers = this.buildHeaders();

    const data = await postJSON(
      `${this.config.baseUrl}/v1/chat/completions`,
      headers,
      payload,
      this.config.timeout
    );

    return this.normalizeResponse(data);
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const payload = { ...this.buildPayload(request), stream: true };
    const headers = this.buildHeaders();

    let buffer = '';
    let id = '';
    let model = request.model;

    await streamJSON(
      `${this.config.baseUrl}/v1/chat/completions`,
      headers,
      payload,
      (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            if (!id && parsed.id) id = parsed.id;
            if (parsed.model) model = parsed.model;

            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              const streamChunk: StreamChunk = {
                id: id || `litellm-${Date.now()}`,
                model,
                delta: { type: 'text', text: delta.content },
              };
              // Yield through external callback since streamJSON doesn't support generators
              this.emitChunk(streamChunk);
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    );
  }

  private emitChunk(chunk: StreamChunk): void {
    // Store for collection by the generator wrapper
    (this as any)._lastChunk = chunk;
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/models`, {
        headers: this.buildHeaders(),
      });
      const data = await res.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Use virtual key if provided, otherwise fall back to master key
    const key = this.config.virtualKey || this.config.apiKey || 'local';
    headers['Authorization'] = `Bearer ${key}`;

    return headers;
  }

  private buildPayload(request: ChatRequest): Record<string, unknown> {
    const messages: Array<{role: string; content: string}> = [];
    
    // Add system message if present
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    
    // Add conversation messages
    for (const msg of request.messages) {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : this.contentBlocksToString(msg.content),
      });
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      messages,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      payload.max_tokens = request.max_tokens;
    }
    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools;
      payload.tool_choice = 'auto';
    }

    return payload;
  }

  private contentBlocksToString(blocks: ContentBlock[]): string {
    return blocks
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }

  private normalizeResponse(data: any): ChatResponse {
    const choice = data.choices?.[0];
    const content: ContentBlock[] = [];

    if (choice?.message?.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name,
          input: JSON.parse(tc.function?.arguments || '{}'),
        });
      }
    }

    return {
      id: data.id || `litellm-${Date.now()}`,
      model: data.model || 'unknown',
      content,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : 
                   choice?.finish_reason === 'length' ? 'max_tokens' : undefined,
    };
  }
}

// Factory function for easy instantiation
export function createLiteLLMProvider(
  baseUrl: string = process.env['LITELLM_BASE_URL'] || 'http://localhost:4000',
  apiKey?: string
): LiteLLMUnifiedProvider {
  return new LiteLLMUnifiedProvider({
    name: 'litellm-unified',
    baseUrl,
    apiKey: apiKey || process.env['LITELLM_MASTER_KEY'] || 'local',
  });
}
