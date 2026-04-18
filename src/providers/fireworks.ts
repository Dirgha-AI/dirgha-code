/**
 * providers/fireworks.ts — Fireworks AI provider (OpenAI-compatible)
 */
import { postJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

/**
 * Convert Anthropic-format messages (content arrays with tool_use / tool_result
 * blocks) into the OpenAI wire format that Fireworks expects.
 */
function toOpenAIMessages(messages: Message[]): any[] {
  const out: any[] = [];

  for (const msg of messages) {
    // Plain string content — pass through unchanged
    if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
      out.push(msg);
      continue;
    }

    const blocks: any[] = msg.content;

    if (msg.role === 'assistant') {
      // Anthropic stores tool calls as tool_use blocks inside content[].
      // OpenAI wants: { role, content?, tool_calls? }
      const text = blocks
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join('');

      const toolCalls = blocks
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));

      const converted: any = { role: 'assistant' };
      if (text) converted.content = text;
      if (toolCalls.length > 0) converted.tool_calls = toolCalls;
      out.push(converted);

    } else if (msg.role === 'user') {
      // Tool results come back as a user message with tool_result blocks.
      // OpenAI wants one { role: 'tool', tool_call_id, content } per result.
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      const otherBlocks = blocks.filter(b => b.type !== 'tool_result');

      for (const tr of toolResults) {
        out.push({
          role: 'tool',
          tool_call_id: tr.tool_use_id,
          content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
        });
      }

      if (otherBlocks.length > 0) {
        const text = otherBlocks.map(b => b.text ?? '').join('');
        if (text) out.push({ role: 'user', content: text });
      }

    } else {
      out.push(msg);
    }
  }

  return out;
}

export async function callFireworks(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const apiKey = process.env['FIREWORKS_API_KEY']!;

  // Always use non-streaming so tool calls are properly normalised.
  // The streaming path discards tool_call chunks, causing silent "no response".
  const data = await postJSON('https://api.fireworks.ai/inference/v1/chat/completions', {
    Authorization: `Bearer ${apiKey}`,
  }, {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(messages)],
    max_tokens: 8192,
    tools: toOpenAITools(),
    tool_choice: 'auto',
    stream: false,
  });

  const response = normaliseOpenAI(data);

  // For pure-text responses, push text to the stream callback so the spinner
  // stops and the REPL renders output (loop.ts only re-emits text when tool
  // blocks are present, so there is no double-emission here).
  if (onStream) {
    const hasToolCalls = response.content.some(b => b.type === 'tool_use');
    if (!hasToolCalls) {
      for (const block of response.content) {
        if (block.type === 'text' && block.text) onStream(block.text);
      }
    }
  }

  return response;
}
