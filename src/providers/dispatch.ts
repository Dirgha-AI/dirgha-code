/**
 * providers/dispatch.ts — Single entry point for LLM calls.
 *
 * Routes to the right provider based on model-id prefix (or env override),
 * handles transient network errors with retry-and-resume, and performs
 * cross-provider failover on 429 rate limits so parallel agents keep flowing
 * instead of thundering-herd-retrying a single exhausted account.
 *
 * NO CLIENT-SIDE RATE LIMITING. Providers enforce server-side and return 429
 * when the account-wide quota is hit. Our answer to that is to walk a
 * cross-provider chain (NVIDIA → OpenRouter → Anthropic) with an equivalent
 * model on each hop, because each account has its own independent quota.
 * Client throttling here only creates extra latency — it can't change an
 * account-level limit that's already hit server-side.
 *
 * NVIDIA NIM (MiniMax M2.7) is the primary provider as of 2026-04-18 after
 * Fireworks Firepass was terminated. Fireworks stays in the switch{} below
 * so a user who sets FIREWORKS_API_KEY and picks a Fireworks model can still
 * reach it, but no automatic chain routes there.
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
import { recordSuccess, recordFailure, isProviderHealthy } from './circuit-breaker.js';
import { isAdminMode, resolveModelId } from './detection.js';

export type ProviderId =
  | 'anthropic' | 'openai' | 'fireworks' | 'openrouter' | 'nvidia' | 'gemini'
  | 'groq' | 'mistral' | 'cohere' | 'deepinfra' | 'perplexity'
  | 'togetherai' | 'xai' | 'ollama' | 'gateway';

/** Infer provider from a model id. */
export function providerFromModelId(id: string): ProviderId | null {
  if (!id) return null;

  if (id.startsWith('dirgha:')) return 'gateway';
  if (id.startsWith('accounts/fireworks/')) return 'fireworks';
  if (id.startsWith('claude-')) return 'anthropic';
  if (id.startsWith('minimaxai/') || id.startsWith('moonshotai/') || id.startsWith('mistralai/')) return 'nvidia';
  if (/^(meta|nvidia|ibm|microsoft|baichuan|writer)\//.test(id) && !id.includes(':')) return 'nvidia';
  if (id.startsWith('grok-') || id.startsWith('xai/')) return 'xai';
  if (id.startsWith('gemini-') || id.startsWith('google/gemini')) return 'gemini';
  if (/^(gpt-|o\d|text-|dall-e|whisper-)/.test(id)) return 'openai';
  if ((id.endsWith('-versatile') || id.endsWith('-instant') || id.startsWith('qwen-qwen3-') || id.startsWith('meta-llama/llama-4-scout')) && !id.includes(':')) return 'groq';
  if (id.startsWith('mistral-') || id.startsWith('codestral-') || id.startsWith('open-mistral')) return 'mistral';
  if (id.startsWith('llama-3.1-sonar') || id.startsWith('sonar-')) return 'perplexity';
  if (id.startsWith('command-')) return 'cohere';
  if (id.startsWith('together/') || id.startsWith('togetherai/')) return 'togetherai';
  if (id.startsWith('deepinfra/')) return 'deepinfra';
  if (id.includes('/') || id.includes(':')) return 'openrouter';
  return null;
}

/** Pick provider. Model-id inference is authoritative. */
export function providerForModel(model: string): ProviderId {
  const inferred = providerFromModelId(model);
  if (inferred) return inferred;
  const override = process.env['DIRGHA_PROVIDER'] as ProviderId | undefined;
  if (override) return override;
  return getActiveProvider() as ProviderId;
}

/** True transient network errors — per-connection, retry same provider. */
const NETWORK_PATTERNS = [
  'econnreset', 'enotfound', 'etimedout', 'econnrefused', 'epipe',
  'fetch failed', 'network error', 'socket hang up', 'aborted',
  'und_err_socket', 'und_err_connect_timeout', 'und_err_headers_timeout',
  '502', 'bad gateway', '503', 'service unavailable', 'overloaded', 'capacity',
];
const RATE_LIMIT_PATTERNS = ['429', 'rate limit', 'rate_limit', 'too many requests'];

function msgOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).toLowerCase();
}
function isNetworkTransient(err: unknown): boolean {
  const m = msgOf(err);
  return NETWORK_PATTERNS.some(p => m.includes(p));
}
function is429(err: unknown): boolean {
  const m = msgOf(err);
  return RATE_LIMIT_PATTERNS.some(p => m.includes(p));
}
function parseRetryAfterMs(msg: string): number | null {
  const m = /retry[-_ ]?after[:\s]+(\d+(?:\.\d+)?)/i.exec(msg);
  if (!m) return null;
  const seconds = parseFloat(m[1]!);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, 30_000);
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Cross-provider fallback chain keyed off model family. Each hop is an
 * independent billing account — walking the chain on 429 bypasses the
 * per-account quota without waiting. Only entries whose API key is
 * present in env are included.
 */
function buildFallbackChain(requestedModel: string): Array<{ provider: ProviderId; model: string }> {
  const chain: Array<{ provider: ProviderId; model: string }> = [];
  // Resolve dirgha: aliases to real model IDs before building chain
  const effectiveModel = resolveModelId(requestedModel);
  const primary = { provider: providerForModel(effectiveModel), model: effectiveModel };
  chain.push(primary);

  const hasNV = !!process.env['NVIDIA_API_KEY'];
  const hasOR = !!process.env['OPENROUTER_API_KEY'];
  const hasAN = !!process.env['ANTHROPIC_API_KEY'] || !!process.env['CLAUDE_API_KEY'];

  // Dedup by (provider, model) tuple so we can chain MULTIPLE NVIDIA models
  // on the same key — e.g. MiniMax M2.7 primary → Kimi K2 fallback when M2.7
  // is wedged server-side. Deduping by provider alone would collapse that.
  const push = (provider: ProviderId, model: string) => {
    if (chain.some(c => c.provider === provider && c.model === model)) return;
    chain.push({ provider, model });
  };

  const m = effectiveModel.toLowerCase();

  // ADMIN MODE still gets the in-provider fallback — Salik's MiniMax M2.7
  // endpoint currently returns 502/timeouts, so we need Kimi K2 as the
  // automatic next hop on the same NVIDIA key. Cross-provider is still off
  // in admin mode (no OpenRouter/Anthropic hops), matching the "stay on
  // primary" intent without trapping the CLI on a dead M2.7.
  if (isAdminMode()) {
    if (primary.provider === 'nvidia' && hasNV) {
      if (m.includes('minimax')) push('nvidia', 'moonshotai/kimi-k2-instruct-0905');
      else if (m.includes('kimi') || m.includes('moonshot')) push('nvidia', 'minimaxai/minimax-m2.5');
    }
    return chain;
  }

  // Kimi / MiniMax family — canonical chain:
  //   NVIDIA M2.7 (user's preferred default)  →
  //   NVIDIA Kimi K2 (same key, sub-second, picks up when M2.7 is down) →
  //   NVIDIA M2.5 (MiniMax capability, different revision — in case Kimi is down too) →
  //   OpenRouter Kimi → Anthropic
  if (m.includes('kimi') || m.includes('moonshot') || m.includes('minimax') || m.includes('dirgha:kimi') || m.includes('dirgha:minimax')) {
    if (hasNV) {
      push('nvidia', 'minimaxai/minimax-m2.7');
      push('nvidia', 'moonshotai/kimi-k2-instruct-0905');
      push('nvidia', 'minimaxai/minimax-m2.5');
    }
    if (hasOR) push('openrouter', 'moonshotai/kimi-k2.5');
    if (hasAN) push('anthropic', 'claude-sonnet-4-6');
    return chain;
  }

  // Claude family: Anthropic → OpenRouter mirror → NVIDIA MiniMax M2.7 → Kimi K2
  if (m.includes('claude') || primary.provider === 'anthropic') {
    if (hasOR) push('openrouter', requestedModel.startsWith('anthropic/') ? requestedModel : `anthropic/${requestedModel}`);
    if (hasNV) {
      push('nvidia', 'minimaxai/minimax-m2.7');
      push('nvidia', 'moonshotai/kimi-k2-instruct-0905');
    }
    return chain;
  }

  // NVIDIA-hosted primary (non-MiniMax/Kimi model like llama-4): try the
  // primary model, then same-key MiniMax, then same-key Kimi, then OpenRouter.
  if (primary.provider === 'nvidia') {
    if (hasNV) {
      push('nvidia', 'minimaxai/minimax-m2.7');
      push('nvidia', 'moonshotai/kimi-k2-instruct-0905');
    }
    if (hasOR) push('openrouter', 'moonshotai/kimi-k2.5');
    return chain;
  }

  // Generic: OpenRouter + NVIDIA M2.7 + NVIDIA Kimi K2. No Fireworks hop —
  // Firepass is gone, other Fireworks models bill per-token.
  if (hasOR && primary.provider !== 'openrouter') push('openrouter', requestedModel);
  if (hasNV) {
    push('nvidia', 'minimaxai/minimax-m2.7');
    push('nvidia', 'moonshotai/kimi-k2-instruct-0905');
  }

  return chain;
}

function callProvider(
  provider: ProviderId,
  model: string,
  messages: Message[],
  systemPrompt: string,
  onStream?: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<ModelResponse> {
  switch (provider) {
    case 'anthropic':   return callAnthropic(messages, systemPrompt, model, onStream, onThinking);
    case 'fireworks':   return callFireworks(messages, systemPrompt, model, onStream);
    case 'openrouter':  return callOpenRouter(messages, systemPrompt, model, onStream);
    case 'nvidia':      return callNvidia(messages, systemPrompt, model, onStream);
    case 'gemini':      return callGemini(messages, systemPrompt, model, onStream);
    case 'openai':      return callOpenAI(messages, systemPrompt, model, onStream);
    case 'groq':        return callGroq(messages, systemPrompt, model, onStream);
    case 'mistral':     return callMistral(messages, systemPrompt, model, onStream);
    case 'cohere':      return callCohere(messages, systemPrompt, model, onStream);
    case 'deepinfra':   return callDeepInfra(messages, systemPrompt, model, onStream);
    case 'perplexity':  return callPerplexity(messages, systemPrompt, model, onStream);
    case 'togetherai':  return callTogetherAI(messages, systemPrompt, model, onStream);
    case 'xai':         return callXAI(messages, systemPrompt, model, onStream);
    case 'gateway':     return callDirgha(messages, systemPrompt, model, onStream);
    default:
      throw new Error(`Unsupported provider '${provider}' for model '${model}'`);
  }
}

/**
 * Retry pure-network drops (not 429) on the same provider, resuming stream
 * from where it broke. 429 is handled at the outer loop as a cross-provider
 * failover, not here — retrying 429 on the same account is a thundering herd.
 */
async function withNetworkResume(
  attemptCall: (attempt: number) => Promise<ModelResponse>,
  _onStream?: (text: string) => void,
  maxAttempts = isAdminMode() ? 30 : 4,
): Promise<ModelResponse> {
  const admin = isAdminMode();
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await attemptCall(i); }
    catch (err) {
      lastErr = err;
      const shouldRetry = isNetworkTransient(err) || (admin && is429(err));
      if (!shouldRetry || i === maxAttempts - 1) throw err;
      const ra = parseRetryAfterMs(msgOf(err));
      const base = ra ?? Math.min(1000 + Math.floor(i / 2) * 1000, 5_000);
      const jitter = Math.floor(Math.random() * 300);
      const waitMs = Math.min(base + jitter, 10_000);
      // Silent retry — meta messages pollute the model output stream and get
      // saved to history as if the assistant said them. Log for debugging only.
      if (process.env['DIRGHA_DEBUG'] === '1') {
        process.stderr.write(`[dispatch] 429 retry ${i+1}/${maxAttempts} wait=${waitMs}ms\n`);
      }
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

/**
 * Main dispatcher with cross-provider 429 failover. For each hop in the chain:
 *   1. Skip if circuit breaker is open for that provider
 *   2. Try the call with network-resume (partial stream preserved on drop)
 *   3. If 429 → log and jump to next provider
 *   4. If network-retry exhausted → jump to next provider too
 *   5. If hard error (auth, context, 4xx non-429) → throw immediately
 */
export async function callModel(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<ModelResponse> {
  const chain = buildFallbackChain(model);
  let lastErr: unknown;

  for (let hop = 0; hop < chain.length; hop++) {
    const { provider, model: hopModel } = chain[hop]!;

    if (!isProviderHealthy(provider)) {
      lastErr = new Error(`Provider ${provider} circuit open`);
      continue;
    }

    // Streaming resume state is per-hop: a 429 failover starts a fresh call
    // on a different provider, so the partial text from the 429'd provider
    // can't be resumed there.
    let partial = '';
    let resumed = false;

    const wrappedStream = onStream
      ? (t: string) => { partial += t; onStream(t); }
      : undefined;

    const attempt = async (attemptIdx: number): Promise<ModelResponse> => {
      let effMsgs = messages;
      if (attemptIdx > 0 && partial.length > 20) {
        if (!resumed) resumed = true;
        effMsgs = [
          ...messages,
          { role: 'assistant', content: partial },
          { role: 'user', content: 'The connection dropped mid-response. Continue exactly where you stopped — do not repeat the text above, just continue the next token onward.' },
        ];
      }
      return callProvider(provider, hopModel, effMsgs, systemPrompt, wrappedStream, onThinking);
    };

    try {
      const response = await withNetworkResume(attempt, onStream);
      recordSuccess(provider);

      if (resumed && partial) {
        const tail = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as any).text ?? '')
          .join('');
        const nonText = response.content.filter(b => b.type !== 'text');
        return { ...response, content: [{ type: 'text', text: partial + tail } as any, ...nonText] };
      }
      return response;
    } catch (err) {
      lastErr = err;

      if (is429(err)) {
        // 429 → jump to next provider. Meta messages go to stderr/log only,
        // never to the model text stream (would pollute history + output).
        if (process.env['DIRGHA_DEBUG'] === '1') {
          const next = chain[hop + 1];
          process.stderr.write(`[dispatch] ${provider} 429 → failover to ${next?.provider ?? 'nothing'}\n`);
        }
        continue;
      }

      if (isNetworkTransient(err)) {
        if (process.env['DIRGHA_DEBUG'] === '1') {
          const next = chain[hop + 1];
          process.stderr.write(`[dispatch] ${provider} transient → failover to ${next?.provider ?? 'nothing'}\n`);
        }
        recordFailure(provider);
        continue;
      }

      // Hard error (invalid key, context too long, model not found) — surface it.
      recordFailure(provider);
      throw err;
    }
  }

  throw lastErr ?? new Error(`All providers exhausted for model ${model}`);
}
