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

/**
 * NVIDIA NIM sometimes wedges on a specific model (observed 2026-04-18: MiniMax
 * M2.7 returned 0 bytes after 90s while Kimi and Llama-4-Maverick on the same
 * key responded in <1s). Guard each call with a hard 60s timeout so dispatch
 * can fail over rather than hang the whole CLI waiting on a dead endpoint.
 */
const REQUEST_TIMEOUT_MS = 60_000;

interface ModelParams { temperature: number; top_p: number; max_tokens: number }

const MODEL_PARAMS: Record<string, ModelParams> = {
  'minimaxai/minimax-m2.5':              { temperature: 1,   top_p: 0.95, max_tokens: 8192 },
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
): Promise<ModelResponse> {
  const apiKey = process.env['NVIDIA_API_KEY'];
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set. Get a key at integrate.api.nvidia.com');

  const headers = { Authorization: `Bearer ${apiKey}` };
  const params = MODEL_PARAMS[model] ?? DEFAULT_PARAMS;
  const payload = {
    model,
    messages: toOpenAIMessages(messages, systemPrompt),
    ...params,
    tools: toOpenAITools(),
    tool_choice: 'auto',
  };

  // Guard every call with a hard timeout so a wedged NVIDIA endpoint (observed
  // 2026-04-18: minimax-m2.7 taking 4+ minutes on a hi prompt) can't hang the
  // CLI. dispatch.ts's network-transient handler catches the abort and fails
  // over to the next hop in the chain.
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(new Error('nvidia request timed out after 60s')), REQUEST_TIMEOUT_MS);

  try {
    if (onStream) {
      let textAccum = '';
      const { usage, toolUseBlocks } = await streamSSE(BASE, headers, payload, (t) => {
        textAccum += t;
        onStream(t);
      });
      const content: ContentBlock[] = [];
      if (textAccum) content.push({ type: 'text', text: textAccum });
      content.push(...toolUseBlocks);
      return { content, usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined };
    }

    return normaliseOpenAI(await postJSON(BASE, headers, payload));
  } finally {
    clearTimeout(timeoutId);
  }
}
