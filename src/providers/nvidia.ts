/**
 * NVIDIA NIM provider.
 *
 * NIM is OpenAI-compatible for /chat/completions, with three quirks:
 *
 *   1. Not every hosted model accepts the `tools` field. Sending tools
 *      to a non-tool model returns HTTP 400. We gate on an allowlist.
 *   2. NIM tokenises tool descriptions tightly and rejects payloads
 *      with very long descriptions. We cap descriptions at 200 chars
 *      before sending.
 *   3. Selected models emit reasoning deltas via `reasoning_content`
 *      rather than `content`. We surface those as thinking events when
 *      the caller opts in.
 */

import type { AgentEvent } from '../kernel/types.js';
import type {
  Provider,
  StreamRequest,
  ProviderConfig,
  ImageGenRequest,
  ImageGenResult,
} from './iface.js';
import { ProviderError } from './iface.js';
import { postJSON } from './http.js';
import { streamChatCompletions } from './openai-compat.js';
import { NIM_BY_ID, NIM_DEPRECATED, NIM_CATALOGUE } from './nim-catalogue.js';

const DEFAULT_BASE = 'https://integrate.api.nvidia.com/v1';
const IMAGE_GEN_BASE = 'https://ai.api.nvidia.com/v1/genai';
const DEFAULT_IMAGE_MODEL = 'black-forest-labs/flux.1-schnell';
const IMAGE_GEN_TIMEOUT_MS = 30_000;

// Tools-supported set derived from the NIM catalogue + extra NIM-hosted models
// that pre-date the catalogue but still accept tools.
const TOOLS_SUPPORTED = new Set<string>([
  // All catalogue models that support tools
  ...NIM_CATALOGUE.filter((m) => m.tools).map((m) => m.id),
  // Extra NIM-hosted models not in the catalogue
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-405b-instruct',
  'meta/llama-4-scout-17b-instruct',
  'z-ai/glm-5.1',
  'deepseek-ai/deepseek-v3.1',
  'deepseek-ai/deepseek-r1',
  'qwen/qwen3-coder',
  'qwen/qwen3-235b-a22b',
]);

// Thinking-supported set derived from the catalogue (any mode other than "none").
const THINKING_SUPPORTED = new Set<string>([
  ...NIM_CATALOGUE.filter((m) => m.thinkingMode !== 'none').map((m) => m.id),
  // Extra legacy NIM models with reasoning channels
  'z-ai/glm-5.1',
  'deepseek-ai/deepseek-v3.1',
  'deepseek-ai/deepseek-r1',
]);

export class NvidiaProvider implements Provider {
  readonly id = 'nvidia';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY ?? '';
    if (!this.apiKey) {
      throw new ProviderError('NVIDIA_API_KEY is required', this.id);
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    // NVIDIA NIM has long tail latency on multi-turn tool followups +
    // reasoning models can stream their chain-of-thought for 2–3 min.
    // 300s absorbs that without making a genuine hang invisible.
    this.timeoutMs = config.timeoutMs ?? 300_000;
  }

  supportsTools(modelId: string): boolean {
    return TOOLS_SUPPORTED.has(modelId);
  }

  supportsThinking(modelId: string): boolean {
    return THINKING_SUPPORTED.has(modelId);
  }

  stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    // Reject deprecated model IDs before hitting the wire.
    if (NIM_DEPRECATED.has(req.model)) {
      throw new ProviderError(
        `Model ${req.model} has been removed from NVIDIA NIM. Use a current model.`,
        this.id,
      );
    }

    const supportsTools = this.supportsTools(req.model);
    const supportsThinking = this.supportsThinking(req.model);
    const catalogueEntry = NIM_BY_ID.get(req.model);

    const extraBody: Record<string, unknown> = {};

    if (catalogueEntry) {
      if (catalogueEntry.thinkingMode === 'default-on' && catalogueEntry.thinkingParam) {
        // Disable thinking by default to avoid infinite-loop bugs (kimi-k2.6, qwen3.5)
        Object.assign(extraBody, catalogueEntry.thinkingParam);
      } else if (
        catalogueEntry.thinkingMode === 'opt-in' &&
        catalogueEntry.thinkingParam &&
        req.thinking && req.thinking !== 'off'
      ) {
        // Enable thinking when caller opts in
        Object.assign(extraBody, catalogueEntry.thinkingParam);
      }
      // Cap max_tokens to catalogue limit if caller went higher
      if (req.maxTokens && req.maxTokens > catalogueEntry.maxOutputTokens) {
        req = { ...req, maxTokens: catalogueEntry.maxOutputTokens };
      }
    } else if (supportsThinking && req.thinking && req.thinking !== 'off') {
      // Legacy fallback for non-catalogue models
      extraBody.chat_template_kwargs = { enable_thinking: true };
    }

    return streamChatCompletions({
      providerName: this.id,
      endpoint: `${this.baseUrl}/chat/completions`,
      apiKey: this.apiKey,
      model: req.model,
      messages: req.messages,
      tools: supportsTools ? req.tools : undefined,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      timeoutMs: this.timeoutMs,
      sanitizeToolDescriptions: desc => (desc.length > 200 ? `${desc.slice(0, 197)}...` : desc),
      includeThinking: supportsThinking,
      extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
    });
  }

  async generateImage(req: ImageGenRequest, signal?: AbortSignal): Promise<ImageGenResult> {
    const model = normalizeImageModel(req.model) ?? DEFAULT_IMAGE_MODEL;
    const width = req.width ?? 1024;
    const height = req.height ?? 1024;
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      width,
      height,
      sampling_steps: req.steps ?? 4,
      cfg_scale: 0,
      seed: req.seed ?? Math.floor(Math.random() * 2_147_483_647),
    };

    const parsed = await postJSON<NvidiaImageResponse>({
      url: `${IMAGE_GEN_BASE}/${model}`,
      apiKey: this.apiKey,
      body,
      providerName: this.id,
      signal,
      timeoutMs: IMAGE_GEN_TIMEOUT_MS,
    });

    const base64 = extractBase64(parsed);
    if (!base64) {
      throw new ProviderError('NVIDIA image response missing base64 payload', this.id);
    }
    return { base64, mimeType: 'image/png', model };
  }
}

interface NvidiaImageResponse {
  artifacts?: Array<{ base64?: string; b64_json?: string }>;
  image?: string;
  images?: string[];
}

function extractBase64(resp: NvidiaImageResponse): string | undefined {
  const first = resp.artifacts?.[0];
  if (first) {
    if (typeof first.base64 === 'string' && first.base64.length > 0) return first.base64;
    if (typeof first.b64_json === 'string' && first.b64_json.length > 0) return first.b64_json;
  }
  if (typeof resp.image === 'string' && resp.image.length > 0) return resp.image;
  if (Array.isArray(resp.images) && typeof resp.images[0] === 'string' && resp.images[0].length > 0) {
    return resp.images[0];
  }
  return undefined;
}

function normalizeImageModel(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const lower = input.toLowerCase();
  if (lower === 'flux.1-schnell' || lower === 'flux-schnell' || lower === 'nvidia/flux'
      || lower === 'flux' || lower === 'black-forest-labs/flux.1-schnell') {
    return DEFAULT_IMAGE_MODEL;
  }
  return input;
}
