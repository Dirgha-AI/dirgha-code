/**
 * providers/detection.ts — Provider detection and default model resolution.
 *
 * Selection order is tuned for "best default for most users":
 *   1. Explicit override (DIRGHA_PROVIDER / DIRGHA_CODE_MODEL)
 *   2. Hosted account (logged in via `dirgha login`) → gateway (Sonnet 4.6 class)
 *   3. BYOK paid tiers: Anthropic, OpenAI, xAI, Gemini → frontier models
 *   4. OpenRouter → frontier proxy
 *   5. Free-tier BYOK (NVIDIA, Fireworks, Groq)
 *   6. Local (Ollama)
 *   7. Fall through to gateway guest tier
 */
import type { Provider } from './types.js';
import { isLoggedIn } from '../utils/credentials.js';

const validProviders: Provider[] = [
  'anthropic', 'openai', 'fireworks', 'openrouter', 'nvidia', 'gemini',
  'groq', 'mistral', 'cohere', 'deepinfra', 'perplexity',
  'togetherai', 'xai', 'ollama', 'gateway',
];

export function getActiveProvider(): Provider {
  const explicit = process.env['DIRGHA_PROVIDER'] as Provider | undefined;
  if (explicit && validProviders.includes(explicit)) return explicit;

  // Infer provider from an explicitly-selected model — prevents
  // cross-provider routing.
  const selectedModel = process.env['DIRGHA_CODE_MODEL'] || process.env['DIRGHA_LOCAL_MODEL'] || '';
  if (selectedModel) {
    if (selectedModel.startsWith('accounts/fireworks/') || selectedModel.startsWith('accounts/')) return 'fireworks';
    if (selectedModel.startsWith('claude-')) return 'anthropic';
    if (selectedModel.startsWith('gpt-')) return 'openai';
    if (selectedModel.startsWith('grok-')) return 'xai';
    if (selectedModel.startsWith('gemini-')) return 'gemini';
    if (selectedModel.startsWith('meta/') || selectedModel.startsWith('nvidia/') || selectedModel.startsWith('minimaxai/') || selectedModel.startsWith('moonshotai/')) return 'nvidia';
    if (selectedModel.includes('/') || selectedModel.includes(':')) return 'openrouter';
  }

  // Logged-in users always go through the gateway so they get pooled
  // frontier-model access and proper quota accounting. We do this
  // BEFORE BYOK keys so a leftover NVIDIA_API_KEY doesn't downgrade a
  // paying user to a free model silently.
  try {
    if (isLoggedIn()) return 'gateway';
  } catch { /* credentials unreadable — fall through to BYOK */ }

  // BYOK: prefer paid frontier keys over free-tier keys.
  if (process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY']) return 'anthropic';
  if (process.env['OPENAI_API_KEY']) return 'openai';
  if (process.env['XAI_API_KEY']) return 'xai';
  if (process.env['GEMINI_API_KEY']) return 'gemini';
  if (process.env['OPENROUTER_API_KEY']) return 'openrouter';
  if (process.env['NVIDIA_API_KEY']) return 'nvidia';
  if (process.env['FIREWORKS_API_KEY']) return 'fireworks';
  if (process.env['GROQ_API_KEY']) return 'groq';
  if (process.env['MISTRAL_API_KEY']) return 'mistral';
  if (process.env['OLLAMA_BASE_URL']) return 'ollama';
  return 'gateway';
}

/**
 * Best-available model per provider. For the hosted gateway, we request
 * a frontier Claude via a gateway-side alias (`dirgha/opus-4-7` routes to
 * Claude Opus 4.7 when the user's plan supports it, otherwise the gateway
 * downgrades to Sonnet 4.6 or a free-tier fallback).
 */
export function getDefaultModel(): string {
  const explicit = process.env['DIRGHA_LOCAL_MODEL'] || process.env['DIRGHA_CODE_MODEL'];
  if (explicit) return explicit;

  const provider = getActiveProvider();
  switch (provider) {
    case 'gateway':    return 'dirgha/opus-4-7';          // Frontier when logged in
    case 'anthropic':  return 'claude-opus-4-7';          // BYOK user wants the best
    case 'openai':     return 'gpt-5.4';
    case 'xai':        return 'grok-4';
    case 'gemini':     return 'gemini-3.1-pro-preview';
    case 'openrouter': return 'anthropic/claude-opus-4-7';
    case 'fireworks':  return 'accounts/fireworks/routers/kimi-k2p5-turbo';
    case 'nvidia':     return 'meta/llama-3.3-70b-instruct';
    case 'groq':       return 'llama-3.3-70b-versatile';
    case 'mistral':    return 'mistral-large-2';
    case 'ollama':     return 'llama3.2:3b';
    default:           return 'claude-opus-4-7';
  }
}
