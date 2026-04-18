/**
 * providers/perplexity.ts — Perplexity AI LLM provider
 * Sprint 8: Add missing provider
 * 
 * Perplexity provides search-augmented LLM API
 */
import { postJSON, streamJSON } from './http.js';
import { toOpenAITools } from './tools-format.js';
import type { Message, ModelResponse, ContentBlock } from '../types.js';
import { normaliseOpenAI } from './normalise.js';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export async function callPerplexity(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const key = process.env['PERPLEXITY_API_KEY'];
  if (!key) throw new Error('Missing PERPLEXITY_API_KEY env var');

  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.7,
    max_tokens: 4096,
    // Perplexity supports search_recency_filter, return_related_questions
    search_recency_filter: 'month', // Options: month, week, day, hour
  };

  if (onStream) {
    let textAccum = '';
    await streamJSON(
      PERPLEXITY_API_URL,
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload,
      (text) => { textAccum += text; onStream(text); },
    );
    const content: ContentBlock[] = [];
    if (textAccum) content.push({ type: 'text', text: textAccum });
    return { content };
  }

  const data = await postJSON(PERPLEXITY_API_URL, { Authorization: `Bearer ${key}` }, payload);
  return normaliseOpenAI(data);
}

// Supported models (search-augmented)
export const PERPLEXITY_MODELS = {
  'sonar-reasoning-pro': { 
    context: 128000, 
    description: 'Sonar Reasoning Pro - Chain of Thought with search',
    search: true 
  },
  'sonar-reasoning': { 
    context: 128000, 
    description: 'Sonar Reasoning - Chain of Thought',
    search: true 
  },
  'sonar-pro': { 
    context: 200000, 
    description: 'Sonar Pro - Advanced search capabilities',
    search: true 
  },
  'sonar': { 
    context: 128000, 
    description: 'Sonar - Lightweight search',
    search: true 
  },
  'llama-3.1-sonar-small-128k-online': { 
    context: 128000, 
    description: 'Llama 3.1 Sonar Small',
    search: true 
  },
  'llama-3.1-sonar-large-128k-online': { 
    context: 128000, 
    description: 'Llama 3.1 Sonar Large',
    search: true 
  },
};
