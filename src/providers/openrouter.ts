/**
 * providers/openrouter.ts — OpenRouter provider (OpenAI-compatible, with streaming)
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import { toOpenAIMessages } from './messages.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

export async function callOpenRouter(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY env var');

  const payload = {
    model,
    messages: toOpenAIMessages(messages, systemPrompt),
    tools: toOpenAITools(),
    tool_choice: 'auto',
    max_tokens: 8192,
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://dirgha.ai',
    'X-Title': 'Dirgha',
  };

  if (onStream) {
    let textAccum = '';
    try {
      await streamJSON(
        'https://openrouter.ai/api/v1/chat/completions',
        headers,
        payload,
        (text) => { textAccum += text; onStream(text); },
      );
      const content: ContentBlock[] = [];
      if (textAccum) content.push({ type: 'text', text: textAccum });
      return { content };
    } catch {
      // Fall through to non-streaming on stream failure
    }
  }

  const data = await postJSON('https://openrouter.ai/api/v1/chat/completions', headers, payload);
  const response = normaliseOpenAI(data);

  if (onStream) {
    const hasTools = response.content.some(b => b.type === 'tool_use');
    if (!hasTools) {
      for (const block of response.content) {
        if (block.type === 'text' && block.text) onStream(block.text);
      }
    }
  }

  return response;
}
