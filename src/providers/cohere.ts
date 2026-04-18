/**
 * providers/cohere.ts — Cohere provider
 * Sprint 8: Add missing provider
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';

const COHERE_API_URL = 'https://api.cohere.com/v2/chat';

export async function callCohere(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['COHERE_API_KEY'];
  if (!key) throw new Error('Missing COHERE_API_KEY env var');

  // Cohere uses a different message format
  const cohereMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...cohereMessages],
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (onStream) {
    let textAccum = '';
    await streamJSON(
      COHERE_API_URL,
      { 
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(
    COHERE_API_URL,
    { 
      Authorization: `Bearer ${key}`,
      'Accept': 'application/json',
    },
    payload,
  );

  // Normalize Cohere response to OpenAI format
  if (data.message?.content) {
    const text = Array.isArray(data.message.content)
      ? data.message.content.map((c: any) => c.text).join('')
      : data.message.content;
    return {
      content: [{ type: 'text', text }],
    };
  }

  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}
