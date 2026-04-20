/**
 * providers/togetherai.ts — TogetherAI LLM provider
 * Sprint 8: Add missing provider
 * 
 * TogetherAI provides fast inference for open-source models
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';

export async function callTogetherAI(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['TOGETHER_API_KEY'];
  if (!key) throw new Error('Missing TOGETHER_API_KEY env var');

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
      TOGETHER_API_URL,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(TOGETHER_API_URL, { Authorization: `Bearer ${key}` }, payload);
  return normaliseOpenAI(data);
}

// Supported models
export const TOGETHERAI_MODELS = {
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { context: 131072, description: 'Meta Llama 3.3 70B Turbo' },
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Lite-Pro': { context: 65536, description: 'Meta Llama 3.1 405B Lite' },
  'mistralai/Mixtral-8x22B-Instruct-v0.1': { context: 65536, description: 'Mistral Mixtral 8x22B' },
  'Qwen/Qwen2.5-72B-Instruct': { context: 32768, description: 'Qwen 2.5 72B' },
  'databricks/dbrx-instruct': { context: 32768, description: 'Databricks DBRX' },
  'nvidia/Llama-3.1-Nemotron-70B-Instruct-HF': { context: 131072, description: 'NVIDIA Nemotron 70B' },
  'google/gemma-2-27b-it': { context: 8192, description: 'Google Gemma 2 27B' },
};
