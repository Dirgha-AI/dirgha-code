/**
 * providers/deepinfra.ts — DeepInfra LLM provider
 * Sprint 8: Add missing provider
 * 
 * DeepInfra provides API access to open-source models
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const DEEPINFRA_API_URL = 'https://api.deepinfra.com/v1/openai/chat/completions';

export async function callDeepInfra(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['DEEPINFRA_API_KEY'];
  if (!key) throw new Error('Missing DEEPINFRA_API_KEY env var');

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
      DEEPINFRA_API_URL,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(DEEPINFRA_API_URL, { Authorization: `Bearer ${key}` }, payload);
  return normaliseOpenAI(data);
}

// Supported models
export const DEEPINFRA_MODELS = {
  'meta-llama/Llama-3.3-70B-Instruct': { context: 131072, description: 'Meta Llama 3.3 70B' },
  'meta-llama/Meta-Llama-3.1-405B-Instruct': { context: 128000, description: 'Meta Llama 3.1 405B' },
  'microsoft/WizardLM-2-8x22B': { context: 65536, description: 'Microsoft WizardLM 2' },
  'Qwen/Qwen2.5-72B-Instruct': { context: 32768, description: 'Qwen 2.5 72B' },
  'deepseek-ai/DeepSeek-R1': { context: 64000, description: 'DeepSeek R1' },
  'NousResearch/Hermes-3-Llama-3.1-405B': { context: 128000, description: 'Nous Hermes 3 405B' },
  'nvidia/Llama-3.1-Nemotron-70B-Instruct': { context: 131072, description: 'NVIDIA Nemotron 70B' },
  '01-ai/Yi-34B-Chat': { context: 4096, description: '01.AI Yi 34B' },
};
