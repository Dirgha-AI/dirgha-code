/**
 * providers/detection.ts — Provider detection and default model resolution
 */
import type { Provider } from './types.js';

const validProviders: Provider[] = [
  'anthropic', 'openai', 'fireworks', 'openrouter', 'nvidia', 'gemini',
  'groq', 'mistral', 'cohere', 'deepinfra', 'perplexity',
  'togetherai', 'xai', 'ollama', 'gateway',
];

export function getActiveProvider(): Provider {
  // Explicit override always wins — allows DIRGHA_PROVIDER=fireworks to force Kimi
  const explicit = process.env['DIRGHA_PROVIDER'] as Provider | undefined;
  if (explicit && validProviders.includes(explicit)) return explicit;

  // Infer provider from selected model ID — prevents cross-provider routing
  const selectedModel = process.env['DIRGHA_CODE_MODEL'] || process.env['DIRGHA_LOCAL_MODEL'] || '';
  if (selectedModel) {
    if (selectedModel.startsWith('accounts/fireworks/') || selectedModel.startsWith('accounts/')) return 'fireworks';
    if (selectedModel.startsWith('claude-')) return 'anthropic';
    if (selectedModel.startsWith('meta/') || selectedModel.startsWith('nvidia/') || selectedModel.startsWith('minimaxai/') || selectedModel.startsWith('moonshotai/')) return 'nvidia';
    // OpenRouter models use "provider/model" or "model:tag" format
    if (selectedModel.includes('/') || selectedModel.includes(':')) return 'openrouter';
  }

  // Key-based fallback — NVIDIA before Fireworks so NVIDIA models don't leak to Fireworks
  if (process.env['NVIDIA_API_KEY']) return 'nvidia';
  if (process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY']) return 'anthropic';
  if (process.env['OPENROUTER_API_KEY']) return 'openrouter';
  if (process.env['FIREWORKS_API_KEY']) return 'fireworks';
  return 'gateway';
}

export function getDefaultModel(): string {
  // Explicit user selection always wins
  const explicit = process.env['DIRGHA_LOCAL_MODEL'] || process.env['DIRGHA_CODE_MODEL'];
  if (explicit) return explicit;

  const provider = getActiveProvider();
  switch (provider) {
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
    // Subscription users (no BYOK) hit api.dirgha.ai gateway; Kimi is
    // the subscription default — the gateway routes this to its org-level
    // Fireworks key (never a personal user key).
    case 'gateway':    return 'minimax-m2';
    default:           return 'claude-sonnet-4-6';
  }
}
