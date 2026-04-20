/**
 * providers/mistral.ts — Mistral AI provider (OpenAI-compatible)
 */
import { postJSON, streamSSE } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

export async function callMistral(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const apiKey = (process.env['MISTRAL_API_KEY'] || process.env['CODESTRAL_API_KEY'])!;

  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 8192,
    tools: toOpenAITools(),
    tool_choice: 'auto',
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (onStream) {
    let textAccum = '';
    try {
      const { toolUseBlocks, usage } = await streamSSE(
        'https://api.mistral.ai/v1/chat/completions',
        headers,
        payload,
        (text) => { textAccum += text; onStream(text); },
      );
      const content: ContentBlock[] = [];
      if (textAccum) content.push({ type: 'text', text: textAccum });
      content.push(...toolUseBlocks);
      return {
        content,
        usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined
      };
    } catch (e) {
      // Fall through to non-streaming
    }
  }

  const data = await postJSON('https://api.mistral.ai/v1/chat/completions', headers, payload);
  return normaliseOpenAI(data);
}
