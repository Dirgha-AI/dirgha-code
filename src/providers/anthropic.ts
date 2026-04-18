// @ts-nocheck
/**
 * providers/anthropic.ts — Anthropic Claude API provider
 */
import { postJSON, streamJSON } from './http.js';
import { TOOL_DEFINITIONS } from '../agent/tools.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';

export async function callAnthropic(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
  onThinking?: (text: string) => void
): Promise<ModelResponse> {
  const apiKey = (process.env['ANTHROPIC_API_KEY'] ?? process.env['CLAUDE_API_KEY'])!;

  const payload: any = {
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages,
    tools: TOOL_DEFINITIONS,
  };

  // Enable thinking for supported models
  if (supportsThinking(model)) {
    payload.thinking = { type: 'enabled', budget_tokens: 4000 };
    payload.max_tokens = 12000;
  }

  if (!onStream) {
    const data = await postJSON(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload,
    );

    const content: ContentBlock[] = (data.content ?? []).map((b: any) => {
      if (b.type === 'text') return { type: 'text' as const, text: b.text };
      if (b.type === 'thinking') return { type: 'thinking' as const, thinking: b.thinking } as any;
      if (b.type === 'tool_use') return { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input };
      return b as ContentBlock;
    });

    const usage = data.usage
      ? { input_tokens: data.usage.input_tokens ?? 0, output_tokens: data.usage.output_tokens ?? 0 }
      : undefined;

    return { content, usage, stop_reason: data.stop_reason };
  }

  // Streaming implementation
  payload.stream = true;
  const content: ContentBlock[] = [];
  let usage: any;
  let stop_reason: string | undefined;

  const stream = streamJSON(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload,
  );

  for await (const event of stream) {
    if (event.type === 'message_start') {
      // initial message info
    } else if (event.type === 'content_block_start') {
      const block = event.content_block;
      if (block.type === 'text') content.push({ type: 'text', text: '' });
      if (block.type === 'thinking') content.push({ type: 'thinking', thinking: '' } as any);
      if (block.type === 'tool_use') content.push({ type: 'tool_use', id: block.id, name: block.name, input: {} });
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta;
      const index = event.index;
      const block = content[index];
      if (!block) continue;

      if (delta.type === 'text_delta') {
        block.text = (block.text || '') + delta.text;
        onStream(delta.text);
      } else if (delta.type === 'thinking_delta') {
        (block as any).thinking = (block as any).thinking + delta.thinking;
        onThinking?.(delta.thinking);
      } else if (delta.type === 'input_json_delta') {
        (block as any).input_str = ((block as any).input_str || '') + delta.partial_json;
      }
    } else if (event.type === 'content_block_stop') {
      const block = content[event.index];
      if (block?.type === 'tool_use' && (block as any).input_str) {
        try { block.input = JSON.parse((block as any).input_str); } catch { /* partial */ }
      }
    } else if (event.type === 'message_delta') {
      stop_reason = event.delta?.stop_reason;
      if (event.usage) usage = { input_tokens: event.usage.input_tokens, output_tokens: event.usage.output_tokens };
    }
  }

  return { content, usage, stop_reason };
}

/** Check if model supports extended thinking capabilities */
export function supportsThinking(model: string): boolean {
  return model.includes('claude-3-7') || model.includes('claude-sonnet-4-5');
}
