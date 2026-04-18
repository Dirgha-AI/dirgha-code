/**
 * providers/vercel.ts — Vercel AI SDK provider
 * Sprint 8: Add missing provider
 * 
 * Vercel AI SDK provider for Vercel AI API
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const VERCEL_API_URL = 'https://api-sdk.vercel.ai/v1/chat/completions';

export async function callVercel(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['VERCEL_API_KEY'];
  if (!key) throw new Error('Missing VERCEL_API_KEY env var');

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
      VERCEL_API_URL,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(VERCEL_API_URL, { Authorization: `Bearer ${key}` }, payload);
  return normaliseOpenAI(data);
}

// Supported models (via Vercel AI SDK)
export const VERCEL_MODELS = {
  'openai/gpt-4o': { context: 128000, description: 'OpenAI GPT-4o' },
  'openai/gpt-4o-mini': { context: 128000, description: 'OpenAI GPT-4o Mini' },
  'anthropic/claude-3-5-sonnet': { context: 200000, description: 'Anthropic Claude 3.5 Sonnet' },
  'anthropic/claude-3-opus': { context: 200000, description: 'Anthropic Claude 3 Opus' },
  'google/gemini-1.5-pro': { context: 2000000, description: 'Google Gemini 1.5 Pro' },
  'google/gemini-1.5-flash': { context: 1000000, description: 'Google Gemini 1.5 Flash' },
  'meta/llama-3.3-70b': { context: 131072, description: 'Meta Llama 3.3 70B' },
};
