/** providers/openai.ts — OpenAI API (OpenAI-compat, primary format) */
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { postJSON, streamSSE, normaliseOpenAI } from './http.js';
import { toOpenAITools } from './tools-format.js';
import { toOpenAIMessages } from './messages.js';

const BASE = 'https://api.openai.com/v1/chat/completions';

export async function callOpenAI(
  messages: Message[], systemPrompt: string, model: string,
  onStream?: (t: string) => void,
): Promise<ModelResponse> {
  const apiKey = process.env['OPENAI_API_KEY']!;
  const headers = { Authorization: `Bearer ${apiKey}` };
  const payload = { model, messages: toOpenAIMessages(messages, systemPrompt), tools: toOpenAITools(), tool_choice: 'auto' };

  if (onStream) {
    let textAccum = '';
    const { usage, toolUseBlocks } = await streamSSE(BASE, headers, payload, (t) => { textAccum += t; onStream(t); });
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    content.push(...toolUseBlocks);
    return { content, usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined };
  }

  return normaliseOpenAI(await postJSON(BASE, headers, payload));
}
