/** providers/dirgha.ts — Dirgha gateway (api.dirgha.ai) — public / authenticated */
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { AuthError } from '../types.js';
import { getToken } from '../utils/credentials.js';
import { postJSON, streamSSE, normaliseOpenAI } from './http.js';
import { toOpenAITools } from './tools-format.js';
import { toOpenAIMessages } from './messages.js';

const DEFAULT_GW = 'https://api.dirgha.ai';

export async function callDirgha(
  messages: Message[], systemPrompt: string, model: string,
  onStream?: (t: string) => void,
): Promise<ModelResponse> {
  const token = getToken();
  if (!token) throw new AuthError();

  const base = (process.env['DIRGHA_GATEWAY_URL'] ?? DEFAULT_GW).replace(/\/$/, '');
  const url = `${base}/api/cli/completions`;
  const headers = { Authorization: `Bearer ${token}` };
  const payload = { model, messages: toOpenAIMessages(messages, systemPrompt), tools: toOpenAITools(), tool_choice: 'auto', max_tokens: 8192 };

  if (onStream) {
    let textAccum = '';
    const { usage, toolUseBlocks } = await streamSSE(url, headers, payload, (t) => { textAccum += t; onStream(t); });
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    content.push(...toolUseBlocks);
    return { content, usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined };
  }

  return normaliseOpenAI(await postJSON(url, headers, payload));
}
