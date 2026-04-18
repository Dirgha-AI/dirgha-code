/**
 * models/registry.ts — Leading 2026 model registry (updated April 2026).
 *
 * Routing policy:
 *   • Subscription users (no BYOK key in ~/.dirgha/keys.json) → requests flow
 *     through the Dirgha gateway at api.dirgha.ai, which routes to upstream
 *     providers using the gateway's own org-level API keys. User never sees
 *     or holds the upstream key.
 *   • BYOK users (their own FIREWORKS_API_KEY / ANTHROPIC_API_KEY / etc.) →
 *     CLI calls the upstream provider directly with the user's key. Their
 *     key stays on their machine and is never sent to api.dirgha.ai.
 *   • Kimi K2.5 Turbo is the subscription default because it's the best
 *     cost/performance at scale; upstream is Fireworks in both paths, but
 *     the key used is different (subscription = Dirgha org; BYOK = user's).
 */
import type { ModelInfo } from './types.js';

export const MODEL_REGISTRY: ModelInfo[] = [

  // ─── Anthropic ─────────────────────────────────────────────────────────
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    description: 'Anthropic flagship — best coding + agentic, 1M context',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 128000, contextWindow: 1000000 },
    pricing: { inputPer1k: 0.015, outputPer1k: 0.075 },
    tags: ['premium', 'reasoning', 'vision', 'long-context', 'recommended'],
    fallback: ['claude-opus-4-6', 'claude-sonnet-4-6'],
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: '#1 SWE-Bench — best coder, professional agentic work',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 128000, contextWindow: 200000 },
    pricing: { inputPer1k: 0.015, outputPer1k: 0.075 },
    tags: ['premium', 'reasoning', 'vision', 'coding'],
    fallback: ['claude-sonnet-4-6'],
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Balanced performance, fast, BYOK-friendly',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 128000, contextWindow: 200000 },
    pricing: { inputPer1k: 0.003, outputPer1k: 0.015 },
    tags: ['balanced', 'vision'],
    fallback: ['claude-haiku-4-5', 'accounts/fireworks/routers/kimi-k2p5-turbo'],
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fastest Anthropic — cheap agentic calls',
    capabilities: { vision: true, functionCalling: true, reasoning: false, streaming: true, maxTokens: 16384, contextWindow: 200000 },
    pricing: { inputPer1k: 0.001, outputPer1k: 0.005 },
    tags: ['fast', 'cheap', 'vision'],
    fallback: ['accounts/fireworks/routers/kimi-k2p5-turbo'],
  },

  // ─── OpenAI ────────────────────────────────────────────────────────────
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    description: 'OpenAI flagship — 77.2% SWE-Bench, complex professional work',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 32768, contextWindow: 400000 },
    pricing: { inputPer1k: 0.005, outputPer1k: 0.02 },
    tags: ['premium', 'vision', 'reasoning'],
    fallback: ['gpt-5.4-mini', 'o4-mini'],
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    description: 'Fast, affordable GPT-5.4 variant for high-volume workloads',
    capabilities: { vision: true, functionCalling: true, reasoning: false, streaming: true, maxTokens: 16384, contextWindow: 128000 },
    pricing: { inputPer1k: 0.0003, outputPer1k: 0.0012 },
    tags: ['fast', 'cheap', 'vision'],
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    description: 'Fastest OpenAI — classification, extraction, sub-agents',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 8192, contextWindow: 128000 },
    pricing: { inputPer1k: 0.0001, outputPer1k: 0.0004 },
    tags: ['fast', 'cheap'],
  },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    provider: 'openai',
    description: 'Reasoning model, tool use, affordable',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 100000, contextWindow: 200000 },
    pricing: { inputPer1k: 0.0011, outputPer1k: 0.0044 },
    tags: ['reasoning', 'coding'],
  },
  {
    id: 'o3',
    name: 'o3',
    provider: 'openai',
    description: 'Deep reasoning on hard problems',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 100000, contextWindow: 200000 },
    pricing: { inputPer1k: 0.015, outputPer1k: 0.06 },
    tags: ['premium', 'reasoning'],
    fallback: ['o4-mini'],
  },

  // ─── Google Gemini ─────────────────────────────────────────────────────
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'gemini',
    description: 'Best reasoning per dollar — highest GPQA Diamond, 2M context',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 65536, contextWindow: 2000000 },
    pricing: { inputPer1k: 0.00125, outputPer1k: 0.01 },
    tags: ['long-context', 'vision', 'reasoning', 'recommended'],
    fallback: ['gemini-3.1-flash'],
  },
  {
    id: 'gemini-3.1-flash',
    name: 'Gemini 3.1 Flash',
    provider: 'gemini',
    description: 'Fast, efficient Gemini — 1M context',
    capabilities: { vision: true, functionCalling: true, reasoning: false, streaming: true, maxTokens: 8192, contextWindow: 1000000 },
    pricing: { inputPer1k: 0.0001, outputPer1k: 0.0004 },
    tags: ['fast', 'cheap', 'vision', 'long-context'],
  },

  // ─── xAI Grok ──────────────────────────────────────────────────────────
  {
    id: 'grok-4',
    name: 'Grok 4',
    provider: 'xai',
    description: 'xAI reasoning model, real-time web access',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 32768, contextWindow: 256000 },
    pricing: { inputPer1k: 0.005, outputPer1k: 0.015 },
    tags: ['reasoning', 'vision', 'web'],
  },

  // ─── Fireworks (subscription default) ──────────────────────────────────
  {
    id: 'accounts/fireworks/routers/kimi-k2p5-turbo',
    name: 'Kimi K2.5 Turbo',
    provider: 'fireworks',
    description: 'Dirgha subscription default — best cost/perf at scale',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 128000, contextWindow: 262144 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['fast', 'unlimited', 'recommended', 'subscription'],
    fallback: ['accounts/fireworks/models/deepseek-v3p2', 'qwen/qwen3-coder:free'],
  },
  {
    id: 'accounts/fireworks/models/deepseek-v3p2',
    name: 'DeepSeek V3.2',
    provider: 'fireworks',
    description: 'Strong reasoning + coding, 50× cheaper than closed-source',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 64000, contextWindow: 128000 },
    pricing: { inputPer1k: 0.0009, outputPer1k: 0.0009 },
    tags: ['reasoning', 'coding'],
    fallback: ['deepseek/deepseek-r1:free'],
  },
  {
    id: 'accounts/fireworks/models/qwen3-max',
    name: 'Qwen3 Max',
    provider: 'fireworks',
    description: 'Alibaba flagship, long context, strong coding',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 32768, contextWindow: 262144 },
    pricing: { inputPer1k: 0.0012, outputPer1k: 0.0048 },
    tags: ['reasoning', 'long-context'],
    fallback: ['accounts/fireworks/routers/kimi-k2p5-turbo'],
  },
  {
    id: 'accounts/fireworks/models/llama-v4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'fireworks',
    description: 'Meta Llama 4 128-expert MoE via Fireworks',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 16384, contextWindow: 1000000 },
    pricing: { inputPer1k: 0.00035, outputPer1k: 0.0014 },
    tags: ['vision', 'long-context'],
    fallback: ['accounts/fireworks/routers/kimi-k2p5-turbo'],
  },

  // ─── OpenRouter (BYOK + free fallback tier) ────────────────────────────
  {
    id: 'anthropic/claude-opus-4-7',
    name: 'Claude Opus 4.7 (OpenRouter)',
    provider: 'openrouter',
    description: 'Anthropic flagship via OpenRouter',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 128000, contextWindow: 1000000 },
    pricing: { inputPer1k: 0.015, outputPer1k: 0.075 },
    tags: ['byok', 'premium'],
    fallback: ['qwen/qwen3-coder:free'],
  },
  {
    id: 'openai/gpt-5.4',
    name: 'GPT-5.4 (OpenRouter)',
    provider: 'openrouter',
    description: 'OpenAI GPT-5.4 via OpenRouter',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 32768, contextWindow: 400000 },
    pricing: { inputPer1k: 0.005, outputPer1k: 0.02 },
    tags: ['byok', 'premium'],
    fallback: ['qwen/qwen3-coder:free'],
  },
  {
    id: 'qwen/qwen3-coder:free',
    name: 'Qwen3 Coder (Free)',
    provider: 'openrouter',
    description: 'OpenRouter free tier, code-tuned',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 32768, contextWindow: 256000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['free', 'coding', 'fallback'],
    fallback: ['meta-llama/llama-4-scout:free'],
  },
  {
    id: 'meta-llama/llama-4-scout:free',
    name: 'Llama 4 Scout (Free)',
    provider: 'openrouter',
    description: 'OpenRouter free tier — Meta Llama 4 Scout, 10M context',
    capabilities: { vision: true, functionCalling: true, reasoning: false, streaming: true, maxTokens: 16384, contextWindow: 10000000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['free', 'fallback', 'long-context', 'vision'],
    fallback: ['deepseek/deepseek-r1:free'],
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    provider: 'openrouter',
    description: 'OpenRouter free tier reasoning model',
    capabilities: { vision: false, functionCalling: false, reasoning: true, streaming: true, maxTokens: 8192, contextWindow: 128000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['free', 'reasoning', 'fallback'],
  },

  // ─── NVIDIA NIM ────────────────────────────────────────────────────────
  {
    id: 'minimax/minimax-m2.7',
    name: 'MiniMax M2.7',
    provider: 'nvidia',
    description: 'NVIDIA default — 230B MoE, coding + reasoning + agentic',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 8192, contextWindow: 256000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['nvidia', 'reasoning', 'coding', 'recommended'],
  },
  {
    id: 'minimax/minimax-m2',
    name: 'MiniMax M2',
    provider: 'nvidia',
    description: 'NVIDIA — 229B MoE',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 8192, contextWindow: 256000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['nvidia', 'reasoning'],
  },
  {
    id: 'meta/llama-4-maverick-17b-128e-instruct',
    name: 'Llama 4 Maverick (NVIDIA)',
    provider: 'nvidia',
    description: '128-expert MoE, multimodal, 1M context via NVIDIA NIM',
    capabilities: { vision: true, functionCalling: true, reasoning: true, streaming: true, maxTokens: 16384, contextWindow: 1000000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['nvidia', 'vision', 'long-context'],
  },
  {
    id: 'meta/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout (NVIDIA)',
    provider: 'nvidia',
    description: '16-expert MoE, 10M context, ultra-long documents via NVIDIA NIM',
    capabilities: { vision: true, functionCalling: true, reasoning: false, streaming: true, maxTokens: 16384, contextWindow: 10000000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['nvidia', 'vision', 'long-context'],
  },

  // ─── Groq (ultra-low-latency) ──────────────────────────────────────────
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout (Groq)',
    provider: 'groq',
    description: 'Llama 4 Scout — ultra-fast Groq inference',
    capabilities: { vision: true, functionCalling: true, reasoning: false, streaming: true, maxTokens: 16384, contextWindow: 10000000 },
    pricing: { inputPer1k: 0.00011, outputPer1k: 0.00034 },
    tags: ['fast', 'ultra-low-latency', 'vision'],
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    description: 'Ultra-fast Groq inference',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 32768, contextWindow: 128000 },
    pricing: { inputPer1k: 0.00059, outputPer1k: 0.00079 },
    tags: ['fast', 'ultra-low-latency'],
  },
  {
    id: 'qwen-qwen3-32b',
    name: 'Qwen3 32B (Groq)',
    provider: 'groq',
    description: 'Qwen3 32B on Groq hardware',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 32768, contextWindow: 128000 },
    pricing: { inputPer1k: 0.00029, outputPer1k: 0.00029 },
    tags: ['fast', 'reasoning', 'ultra-low-latency'],
  },

  // ─── Mistral ───────────────────────────────────────────────────────────
  {
    id: 'mistral-large-2',
    name: 'Mistral Large 2',
    provider: 'mistral',
    description: 'Mistral flagship',
    capabilities: { vision: false, functionCalling: true, reasoning: true, streaming: true, maxTokens: 32768, contextWindow: 128000 },
    pricing: { inputPer1k: 0.002, outputPer1k: 0.006 },
    tags: ['balanced'],
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistral',
    description: 'Mistral code specialist',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 32768, contextWindow: 128000 },
    pricing: { inputPer1k: 0.0003, outputPer1k: 0.0009 },
    tags: ['coding', 'cheap'],
  },

  // ─── Local (Ollama) ────────────────────────────────────────────────────
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B (Local)',
    provider: 'ollama',
    description: 'Fast local model',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 4096, contextWindow: 128000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['local', 'free', 'fast'],
  },
  {
    id: 'qwen3-coder:8b',
    name: 'Qwen3 Coder 8B (Local)',
    provider: 'ollama',
    description: 'Offline code model for Dirgha AI laptops',
    capabilities: { vision: false, functionCalling: true, reasoning: false, streaming: true, maxTokens: 32768, contextWindow: 128000 },
    pricing: { inputPer1k: 0, outputPer1k: 0 },
    tags: ['local', 'free', 'coding', 'offline'],
  },
];

export const ALL_MODELS = MODEL_REGISTRY;
export function getModelById(id: string) { return MODEL_REGISTRY.find(m => m.id === id); }

export class ModelRegistry {
  static getModel(id: string): ModelInfo | undefined {
    return MODEL_REGISTRY.find(m => m.id === id);
  }

  static getModelsByProvider(provider: string): ModelInfo[] {
    return MODEL_REGISTRY.filter(m => m.provider === provider);
  }

  static getModelsByTag(tag: string): ModelInfo[] {
    return MODEL_REGISTRY.filter(m => m.tags.includes(tag));
  }

  static getModelsByCapability(capability: keyof ModelInfo['capabilities']): ModelInfo[] {
    return MODEL_REGISTRY.filter(m => m.capabilities[capability]);
  }

  static getRecommendedModel(task: 'coding' | 'reasoning' | 'vision' | 'fast' | 'cheap' | 'balanced'): string {
    const recommendations: Record<string, string> = {
      coding:    'claude-opus-4-6',
      reasoning: 'gemini-3.1-pro-preview',
      vision:    'gemini-3.1-pro-preview',
      fast:      'accounts/fireworks/routers/kimi-k2p5-turbo',
      cheap:     'qwen/qwen3-coder:free',
      balanced:  'claude-sonnet-4-6',
    };
    return recommendations[task] || 'accounts/fireworks/routers/kimi-k2p5-turbo';
  }

  static getFallbackChain(modelId: string): string[] {
    const model = this.getModel(modelId);
    if (!model?.fallback) return [];
    return model.fallback.filter(id => this.getModel(id) !== undefined);
  }
}
