/**
 * providers/detection.ts — Provider detection and default model resolution
 */
import type { Provider } from './types.js';

const validProviders: Provider[] = [
  'anthropic', 'openai', 'fireworks', 'openrouter', 'nvidia', 'gemini',
  'groq', 'mistral', 'cohere', 'deepinfra', 'perplexity',
  'togetherai', 'xai', 'ollama', 'gateway',
];

/**
 * Admin mode: personal BYOK use (Salik's Fireworks Firepass + NVIDIA key).
 * - NEVER route through gateway — always direct to provider
 * - NO client-side throttling
 * - Dispatch does extra failover attempts on 429
 * Trigger with DIRGHA_ADMIN=1 in env.
 */
export function isAdminMode(): boolean {
  return process.env['DIRGHA_ADMIN'] === '1' || process.env['DIRGHA_ADMIN'] === 'true';
}

export function getActiveProvider(): Provider {
  // Explicit override always wins — allows DIRGHA_PROVIDER=fireworks to force Kimi
  const explicit = process.env['DIRGHA_PROVIDER'] as Provider | undefined;
  if (explicit && validProviders.includes(explicit)) return explicit;

  // Infer provider from selected model ID — prevents cross-provider routing
  const selectedModel = process.env['DIRGHA_CODE_MODEL'] || process.env['DIRGHA_LOCAL_MODEL'] || '';
  if (selectedModel) {
    // Dirgha gateway models (dirgha:kimi, dirgha:auto, etc.) always go through gateway
    if (selectedModel.startsWith('dirgha:')) return 'gateway';
    if (selectedModel.startsWith('accounts/fireworks/') || selectedModel.startsWith('accounts/')) return 'fireworks';
    if (selectedModel.startsWith('claude-')) return 'anthropic';
    if (selectedModel.startsWith('meta/') || selectedModel.startsWith('nvidia/') || selectedModel.startsWith('minimaxai/') || selectedModel.startsWith('moonshotai/') || selectedModel.startsWith('minimax/')) return 'nvidia';
    // OpenRouter models use "provider/model" or "model:tag" format
    if (selectedModel.includes('/') || selectedModel.includes(':')) return 'openrouter';
  }

  // Admin mode: never pick gateway. Pick first available BYOK provider.
  // Order matters: NVIDIA (MiniMax M2.7 NIM) is primary as of 2026-04-18 —
  // Fireworks Firepass plan ended, the turbo router now 429s on every call.
  // Fireworks is kept last so an explicit user opt-in still works, but no
  // default path ever selects it.
  if (isAdminMode()) {
    if (process.env['NVIDIA_API_KEY']) return 'nvidia';
    if (process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY']) return 'anthropic';
    if (process.env['OPENROUTER_API_KEY']) return 'openrouter';
    if (process.env['FIREWORKS_API_KEY']) return 'fireworks';
    throw new Error('DIRGHA_ADMIN=1 set but no BYOK key present (NVIDIA_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY / FIREWORKS_API_KEY)');
  }

  // BYOK takes precedence over gateway — if any provider key is present,
  // route directly to that provider (dev/power-user flow, avoids gateway latency).
  if (process.env['NVIDIA_API_KEY']) return 'nvidia';
  if (process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY']) return 'anthropic';
  if (process.env['OPENROUTER_API_KEY']) return 'openrouter';
  if (process.env['FIREWORKS_API_KEY']) return 'fireworks';

  // No BYOK keys — if the user is logged in, default to gateway (org keys,
  // cross-provider failover, tier-limited). Otherwise return 'gateway' too;
  // callDirgha will throw AuthError prompting `dirgha login`.
  return 'gateway';
}

// Maps dirgha: model aliases to real model IDs sent to the gateway / BYOK provider.
// As of 2026-04-18 Fireworks Firepass is gone — `dirgha:kimi` and `dirgha:auto`
// now resolve to NVIDIA MiniMax M2.7 (the best-in-class BYOK replacement).
const DIRGHA_MODEL_MAP: Record<string, string> = {
  'dirgha:kimi':    'minimaxai/minimax-m2.7',
  'dirgha:minimax': 'minimaxai/minimax-m2.7',
  'dirgha:llama4':  'meta/llama-4-maverick-17b-128e-instruct',
  'dirgha:auto':    'minimaxai/minimax-m2.7',
};

export function resolveModelId(modelId: string): string {
  return DIRGHA_MODEL_MAP[modelId] ?? modelId;
}

export function getDefaultModel(): string {
  // Explicit user selection always wins
  const explicit = process.env['DIRGHA_LOCAL_MODEL'] || process.env['DIRGHA_CODE_MODEL'];
  if (explicit) return explicit;

  const provider = getActiveProvider();
  switch (provider) {
    case 'gateway':    return 'dirgha:minimax';  // post-Firepass default — resolves to NVIDIA MiniMax
    case 'anthropic':  return 'claude-sonnet-4-6';
    case 'fireworks':  return 'accounts/fireworks/routers/kimi-k2p5-turbo';
    case 'openrouter': return 'anthropic/claude-sonnet-4-6';
    case 'nvidia':     return 'minimaxai/minimax-m2.7';
    case 'gemini':     return 'gemini-3.1-pro-preview';
    case 'openai':     return 'gpt-5.4';
    case 'xai':        return 'grok-4';
    case 'groq':       return 'llama-3.3-70b-versatile';
    case 'mistral':    return 'mistral-large-2';
    case 'ollama':     return 'llama3.2:3b';
    default:           return 'claude-sonnet-4-6';
  }
}
