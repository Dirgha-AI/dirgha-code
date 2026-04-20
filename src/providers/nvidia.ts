/**
 * providers/nvidia.ts — NVIDIA NIM provider (OpenAI-compatible)
 * Endpoint: https://integrate.api.nvidia.com/v1
 * Auth: Bearer nvapi-...
 *
 * Hosted models (each has different optimal params):
 *   minimaxai/minimax-m2.7        temperature=1,   top_p=0.95, max_tokens=8192
 *   moonshotai/kimi-k2-instruct-0905  temperature=0.6, top_p=0.9,  max_tokens=4096
 */
import { postJSON, streamSSE } from './http.js';
import { toOpenAITools } from './tools-format.js';
import { toOpenAIMessages } from './messages.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';

interface ModelParams { temperature: number; top_p: number; max_tokens: number }

const MODEL_PARAMS: Record<string, ModelParams> = {
  'minimaxai/minimax-m2.7':              { temperature: 1,   top_p: 0.95, max_tokens: 8192 },
  'moonshotai/kimi-k2-instruct-0905':    { temperature: 0.6, top_p: 0.9,  max_tokens: 4096 },
  'mistralai/mistral-nemotron':          { temperature: 0.6, top_p: 0.7,  max_tokens: 4096 },
};
const DEFAULT_PARAMS: ModelParams = { temperature: 0.6, top_p: 0.9, max_tokens: 4096 };

export async function callNvidia(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<ModelResponse> {
  const apiKey = process.env['NVIDIA_API_KEY'];
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set. Get a key at integrate.api.nvidia.com');

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
  const params = MODEL_PARAMS[model] ?? DEFAULT_PARAMS;
  const payload = {
    model,
    messages: toOpenAIMessages(messages, systemPrompt),
    ...params,
    tools: toOpenAITools(),
    tool_choice: 'auto',
  };

  if (onStream) {
    let textAccum = '';
    const { usage, toolUseBlocks } = await streamSSE(BASE, headers, payload, (t) => {
      textAccum += t;
      onStream(t);
    }, onThinking);
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    content.push(...toolUseBlocks);
    return { content, usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined };
  }

  return normaliseOpenAI(await postJSON(BASE, headers, payload));
}
