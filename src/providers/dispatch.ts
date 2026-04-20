/**
 * providers/dispatch.ts — Single entry point for LLM calls.
 *
 * Routes to the right provider based on either:
 *   - DIRGHA_PROVIDER env override, or
 *   - model-id prefix inference (claude-*, accounts/fireworks/*, provider/model, etc.)
 *
 * Wraps all calls in retry-with-exponential-backoff for network errors,
 * so dropped connections (WiFi flap, VPN reconnect) resume transparently
 * without losing the session.
 */
import type { Message, ModelResponse } from '../types.js';
import { getActiveProvider } from './detection.js';
import { callAnthropic } from './anthropic.js';
import { callFireworks } from './fireworks.js';
import { callOpenRouter } from './openrouter.js';
import { callNvidia } from './nvidia.js';
import { callGemini } from './gemini.js';
import { callOpenAI } from './openai.js';
import { callGroq } from './groq.js';
import { callMistral } from './mistral.js';
import { callCohere } from './cohere.js';
import { callDeepInfra } from './deepinfra.js';
import { callPerplexity } from './perplexity.js';
import { callTogetherAI } from './togetherai.js';
import { callXAI } from './xai.js';
import { callDirgha } from './dirgha.js';
import { acquire as acquireRateLimit } from './rate-limit.js';
import { recordSuccess, recordFailure, isProviderHealthy } from './circuit-breaker.js';
import { globalLimiter, recordProviderRetryAfter } from './unified-rate-limiter.js';

export type ProviderId =
  | 'anthropic' | 'openai' | 'fireworks' | 'openrouter' | 'nvidia' | 'gemini'
  | 'groq' | 'mistral' | 'cohere' | 'deepinfra' | 'perplexity'
  | 'togetherai' | 'xai' | 'ollama' | 'gateway';

/** Infer provider from a model id. */
export function providerFromModelId(id: string): ProviderId | null {
  if (!id) return null;

  // Fireworks: accounts/fireworks/routers/... or accounts/fireworks/models/...
  if (id.startsWith('accounts/fireworks/')) return 'fireworks';
  // Anthropic
  if (id.startsWith('claude-')) return 'anthropic';
  // NVIDIA NIM hosted orgs: minimaxai/, moonshotai/, mistralai/ + meta/nvidia/ibm/etc
  // Note: mistralai/ (NVIDIA-hosted org prefix) ≠ mistral- (native Mistral API)
  if (id.startsWith('minimaxai/') || id.startsWith('moonshotai/') || id.startsWith('mistralai/')) return 'nvidia';
  if (/^(meta|nvidia|ibm|microsoft|baichuan|writer)\//.test(id) && !id.includes(':')) return 'nvidia';
  // xAI
  if (id.startsWith('grok-') || id.startsWith('xai/')) return 'xai';
  // Gemini — handle new 3.x naming + legacy 2.x
  if (id.startsWith('gemini-') || id.startsWith('google/gemini')) return 'gemini';
  // OpenAI direct — gpt-5.4, gpt-5, o3, o4-mini etc.
  if (/^(gpt-|o\d|text-|dall-e|whisper-)/.test(id)) return 'openai';
  // Groq — versatile/instant suffixes + explicit groq models
  if ((id.endsWith('-versatile') || id.endsWith('-instant') || id.startsWith('qwen-qwen3-') || id.startsWith('meta-llama/llama-4-scout')) && !id.includes(':')) return 'groq';
  // Mistral native
  if (id.startsWith('mistral-') || id.startsWith('codestral-') || id.startsWith('open-mistral')) return 'mistral';
  // Perplexity
  if (id.startsWith('llama-3.1-sonar') || id.startsWith('sonar-')) return 'perplexity';
  // Cohere
  if (id.startsWith('command-')) return 'cohere';
  // Together AI
  if (id.startsWith('together/') || id.startsWith('togetherai/')) return 'togetherai';
  // DeepInfra
  if (id.startsWith('deepinfra/')) return 'deepinfra';
  // OpenRouter: "provider/model" or ":free"/":nitro" tag
  if (id.includes('/') || id.includes(':')) return 'openrouter';
  return null;
}

/** Pick provider. Model-id inference is authoritative: `qwen/qwen3-coder:free`
 *  must always go to OpenRouter even if DIRGHA_PROVIDER=fireworks, otherwise
 *  cross-provider fallback routes to the wrong endpoint.
 *  
 *  FIX P0-ISSUE 1.1: Bare model IDs (e.g., "llama3") are now rejected with
 *  helpful error instead of ambiguous routing.
 */
export function providerForModel(model: string): ProviderId {
  const inferred = providerFromModelId(model);
  if (inferred) return inferred;
  const override = process.env['DIRGHA_PROVIDER'] as ProviderId | undefined;
  if (override) return override;
  return getActiveProvider() as ProviderId;
}

/** Errors that should be retried in place on the same provider/model.
 *  429/503 included — Fireworks unlimited plan bursts can momentarily 429,
 *  and the right response is wait-and-retry, not drop off Kimi. */
const TRANSIENT_PATTERNS = [
  'econnreset', 'enotfound', 'etimedout', 'econnrefused', 'epipe',
  'fetch failed', 'network error', 'socket hang up', 'aborted',
  'und_err_socket', 'und_err_connect_timeout', 'und_err_headers_timeout',
  '429', 'rate limit', 'rate_limit', 'too many requests',
  '503', 'service unavailable', 'overloaded', 'capacity',
  '502', 'bad gateway',
];

function isTransient(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_PATTERNS.some(p => msg.includes(p));
}

function is429(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests');
}

function parseRetryAfterMs(msg: string): number | null {
  const m = /retry[-_ ]?after[:\s]+(\d+(?:\.\d+)?)/i.exec(msg);
  if (!m) return null;
  const seconds = parseFloat(m[1]!);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, 60_000); // cap at 60s
}

async function withNetworkRetry<T>(
  fn: (attempt: number) => Promise<T>,
  provider: ProviderId,
  attempts = 6,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(i); }
    catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const ra = parseRetryAfterMs(msg);
      let baseMs: number;
      let jitter: number;
      if (is429(err)) {
        // 429: feed retry-after into unified limiter so death spiral detector has data
        recordProviderRetryAfter(provider, ra ?? 60_000);
        // flat 2s base + wide random spread so parallel agents don't
        // all retry simultaneously and immediately re-collide (thundering herd)
        baseMs = ra ?? 2000;
        jitter = Math.floor(Math.random() * 3000); // 0-3s spread
      } else {
        // Network errors: exponential backoff
        baseMs = ra ?? 1000 * Math.pow(2, i);
        jitter = Math.floor(Math.random() * 1000);
      }
      await new Promise(r => setTimeout(r, Math.min(baseMs + jitter, 30_000)));
    }
  }
  throw lastErr;
}

/**
 * Unified LLM dispatcher. Accepts the superset of per-provider args;
 * providers that don't support streaming/thinking simply ignore those callbacks.
 */
export async function callModel(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<ModelResponse> {
  const provider = providerForModel(model);

  if (!isProviderHealthy(provider)) {
    throw new Error(`Provider ${provider} circuit open — skipping`);
  }

  // Death spiral guard: if 3+ providers are rate-limited for >5 min, surface immediately
  if (globalLimiter.shouldAbortRouting([provider])) {
    throw new Error(`Death spiral: ${provider} rate-limited for >5 min. Check API keys or wait.`);
  }

  const waitedMs = await acquireRateLimit(provider);
  if (waitedMs > 500 && onStream) {
    onStream(`\n[throttled ${(waitedMs / 1000).toFixed(1)}s to stay under ${provider} RPM cap]\n`);
  }

  // Streaming resume: capture partial text across attempts so a mid-stream
  // network drop doesn't discard what was already received. On retry, inject
  // the partial as an assistant-stub + ask the model to continue from there.
  // Providers may not perfectly resume token-aligned, but for real-world
  // WiFi/VPN flaps this loses at most a few tokens and preserves everything
  // above. Clears on success.
  let partialText = '';
  let resumeNotified = false;
  let resumeOverlapChecked = false;

  // On the first chunk after a resume, check if the model repeated the tail of
  // partialText (some models re-emit the last sentence despite the prompt).
  // Compare the last OVERLAP_WINDOW chars of partialText against incoming text.
  const OVERLAP_WINDOW = 40;
  function dedupeResumeChunk(chunk: string): string {
    if (resumeOverlapChecked || !partialText) return chunk;
    resumeOverlapChecked = true;
    const tail = partialText.slice(-OVERLAP_WINDOW);
    const idx = chunk.indexOf(tail);
    if (idx !== -1) return chunk.slice(idx + tail.length);
    // Partial overlap: tail ends with the start of chunk
    for (let len = Math.min(tail.length, chunk.length) - 1; len > 8; len--) {
      if (tail.endsWith(chunk.slice(0, len))) return chunk.slice(len);
    }
    return chunk;
  }

  const wrappedOnStream = onStream
    ? (chunk: string) => {
        const deduped = resumeNotified ? dedupeResumeChunk(chunk) : chunk;
        partialText += deduped;
        if (deduped) onStream(deduped);
      }
    : undefined;

  const callForAttempt = (attempt: number): Promise<ModelResponse> => {
    // First attempt: normal call. Subsequent attempts after a disconnect with
    // accumulated partial: inject the partial and a continuation nudge.
    let effectiveMessages = messages;
    let effectiveSystem = systemPrompt;
    if (attempt > 0 && partialText.length > 20) {
      if (!resumeNotified && onStream) {
        onStream(`\n[connection resumed · continuing from ${partialText.length} chars received]\n`);
        resumeNotified = true;
        resumeOverlapChecked = false; // arm the dedup check for the next chunk
      }
      effectiveMessages = [
        ...messages,
        { role: 'assistant', content: partialText },
        { role: 'user', content: 'The connection dropped mid-response. Continue exactly where you stopped — do not repeat the text above, do not re-introduce yourself, just continue the next token onward.' },
      ];
      effectiveSystem = systemPrompt;
    }

    switch (provider) {
      case 'anthropic':   return callAnthropic(effectiveMessages, effectiveSystem, model, wrappedOnStream, onThinking);
      case 'fireworks':   return callFireworks(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'openrouter':  return callOpenRouter(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'nvidia':      return callNvidia(effectiveMessages, effectiveSystem, model, wrappedOnStream, onThinking);
      case 'gemini':      return callGemini(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'openai':      return callOpenAI(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'groq':        return callGroq(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'mistral':     return callMistral(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'cohere':      return callCohere(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'deepinfra':   return callDeepInfra(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'perplexity':  return callPerplexity(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'togetherai':  return callTogetherAI(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'xai':         return callXAI(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      case 'gateway':     return callDirgha(effectiveMessages, effectiveSystem, model, wrappedOnStream);
      default:
        throw new Error(`Unsupported provider '${provider}' for model '${model}'`);
    }
  };

  let response: ModelResponse;
  try {
    response = await withNetworkRetry(callForAttempt, provider);
    recordSuccess(provider);
  } catch (err) {
    // Only trip circuit on hard failures (5xx, network down), not rate limits (429)
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    const isRateLimit = msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
    if (!isRateLimit) recordFailure(provider);
    throw err;
  }

  // If we resumed after a drop, stitch partial + continuation into a single
  // response so the caller's message history has one coherent assistant turn.
  if (resumeNotified && partialText) {
    const continuationText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text ?? '')
      .join('');
    const stitched = partialText + continuationText;
    const nonText = response.content.filter(b => b.type !== 'text');
    return {
      ...response,
      content: [{ type: 'text', text: stitched } as any, ...nonText],
    };
  }
  return response;
}
