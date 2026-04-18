/**
 * providers/mistral.ts — Mistral AI provider
 * Sprint 8: Add missing provider
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

export async function callMistral(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['MISTRAL_API_KEY'];
  if (!key) throw new Error('Missing MISTRAL_API_KEY env var');

  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    tools: toOpenAITools(),
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (onStream) {
    let textAccum = '';
    await streamJSON(
      MISTRAL_API_URL,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(MISTRAL_API_URL, { Authorization: `Bearer ${key}` }, payload);
  return normaliseOpenAI(data);
}
