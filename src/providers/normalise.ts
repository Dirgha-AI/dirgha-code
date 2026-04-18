/**
 * providers/normalise.ts — Response normalisation (OpenAI format → ModelResponse)
 */
import type { ModelResponse, ContentBlock } from '../types.js';

export function normaliseOpenAI(data: any): ModelResponse {
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error('Invalid OpenAI response: no choices[0].message');

  const content: ContentBlock[] = [];

  if (typeof msg.content === 'string' && msg.content) {
    content.push({ type: 'text', text: msg.content });
  }

  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      let input: Record<string, any> = {};
      try {
        input = JSON.parse(tc.function?.arguments ?? '{}');
      } catch { /* leave empty */ }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function?.name,
        input,
      });
    }
  }

  const usage = data?.usage
    ? { input_tokens: data.usage.prompt_tokens ?? 0, output_tokens: data.usage.completion_tokens ?? 0 }
    : undefined;

  return { content, usage };
}
