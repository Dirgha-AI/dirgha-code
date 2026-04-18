/**
 * providers/xai.ts — xAI/Grok provider
 * Sprint 8: Add missing provider
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

export async function callXAI(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['XAI_API_KEY'];
  if (!key) throw new Error('Missing XAI_API_KEY env var');

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
      XAI_API_URL,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(XAI_API_URL, { Authorization: `Bearer ${key}` }, payload);
  return normaliseOpenAI(data);
}
