/**
 * agent/model-fallback.ts — Provider fallback chain for model errors.
 *
 * When a model call fails (rate limit, context exceeded, provider error),
 * automatically retry with the next model in the fallback chain for that tier.
 */

/** Error categories that warrant a cross-model fallback.
 *  NOTE: transient errors (429 / 5xx / network resets) are handled in
 *  providers/dispatch.ts with retry-and-backoff on the SAME model, so they
 *  are deliberately NOT here — otherwise a single burst on Fireworks would
 *  silently move a subscription user off Kimi. Only genuine
 *  model/quota/context failures should trigger cross-model fallback. */
const FALLBACK_ERRORS = [
  'quota exceeded',
  'insufficient_quota',
  'context_length_exceeded',
  'context window',
  'too long',
  'model not found',
  'model_not_found',
  'not_found_error',
  'permission denied',
  'invalid_api_key',
];

/** Ordered fallback chains by primary model.
 *  Policy: subscription primary = Kimi (Fireworks); cross-provider fallback
 *  drops to OpenRouter free tier so users never hit a dead end.
 */
const FALLBACK_CHAINS: Record<string, string[]> = {
  // Anthropic (2026 line)
  'claude-opus-4-7':   ['claude-sonnet-4-6', 'claude-haiku-4-5', 'accounts/fireworks/routers/kimi-k2p5-turbo'],
  'claude-sonnet-4-6': ['claude-haiku-4-5', 'accounts/fireworks/routers/kimi-k2p5-turbo', 'qwen/qwen3-coder:free'],
  'claude-haiku-4-5':  ['accounts/fireworks/routers/kimi-k2p5-turbo', 'qwen/qwen3-coder:free'],

  // OpenAI
  'gpt-5':      ['gpt-5-mini', 'o4-mini', 'qwen/qwen3-coder:free'],
  'gpt-5-mini': ['o4-mini', 'qwen/qwen3-coder:free'],
  'o3':         ['o4-mini', 'deepseek/deepseek-r1:free'],
  'o4-mini':    ['gpt-5-mini', 'deepseek/deepseek-r1:free'],

  // Gemini
  'gemini-2-5-pro':   ['gemini-2-5-flash', 'qwen/qwen3-coder:free'],
  'gemini-2-5-flash': ['qwen/qwen3-coder:free'],

  // xAI
  'grok-4': ['accounts/fireworks/routers/kimi-k2p5-turbo', 'qwen/qwen3-coder:free'],

  // Fireworks (subscription) — fall back to OpenRouter free tier
  'accounts/fireworks/routers/kimi-k2p5-turbo': ['qwen/qwen3-coder:free', 'meta-llama/llama-3.3-70b-instruct:free'],
  'accounts/fireworks/models/deepseek-v3p2':    ['deepseek/deepseek-r1:free', 'qwen/qwen3-coder:free'],
  'accounts/fireworks/models/qwen3-max':        ['qwen/qwen3-coder:free', 'meta-llama/llama-3.3-70b-instruct:free'],
  'accounts/fireworks/models/llama-v4-maverick': ['meta-llama/llama-3.3-70b-instruct:free'],

  // Groq
  'llama-3.3-70b-versatile': ['llama-3.1-8b-instant', 'meta-llama/llama-3.3-70b-instruct:free'],

  // OpenRouter — free tier chains for BYOK resilience
  'qwen/qwen3-coder:free':          ['meta-llama/llama-4-scout:free', 'deepseek/deepseek-r1:free'],
  'meta-llama/llama-4-scout:free':  ['qwen/qwen3-coder:free', 'deepseek/deepseek-r1:free'],
  'deepseek/deepseek-r1:free':      ['qwen/qwen3-coder:free'],

  // OpenRouter — paid
  'anthropic/claude-opus-4-7': ['qwen/qwen3-coder:free'],
  'openai/gpt-5.4':            ['qwen/qwen3-coder:free'],

  // NVIDIA
  'minimax/minimax-m2.7':                     ['minimax/minimax-m2', 'qwen/qwen3-coder:free'],
  'minimax/minimax-m2':                       ['qwen/qwen3-coder:free'],
  'meta/llama-4-maverick-17b-128e-instruct':  ['minimax/minimax-m2.7', 'qwen/qwen3-coder:free'],
  'meta/llama-4-scout-17b-16e-instruct':      ['minimax/minimax-m2.7', 'qwen/qwen3-coder:free'],

  // Groq
  'meta-llama/llama-4-scout-17b-16e-instruct': ['llama-3.3-70b-versatile', 'qwen/qwen3-coder:free'],
  'qwen-qwen3-32b':                            ['llama-3.3-70b-versatile'],

  // Mistral
  'mistral-large-2':   ['codestral-latest', 'qwen/qwen3-coder:free'],
  'codestral-latest':  ['qwen/qwen3-coder:free'],
};

/** No default fallback — prevents silent routing to random paid models */
const DEFAULT_CHAIN: string[] = [];

export function isFallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return FALLBACK_ERRORS.some(e => msg.includes(e.toLowerCase()));
}

export function getFallbackChain(model: string): string[] {
  // Normalize: strip provider prefix for lookup
  const chain = FALLBACK_CHAINS[model] ?? DEFAULT_CHAIN;
  return chain.filter(m => m !== model);
}

export interface FallbackResult {
  model: string;  // model that succeeded
  attempts: number;
}

/**
 * Call `fn` with the given model. If it hits a hard failure (quota, bad key,
 * context overflow), surface a clear error message and suggested alternative —
 * but NEVER auto-switch. The user stays in control of their model choice.
 * Switching mid-session destroys coding context and project state.
 */
export async function withModelFallback<T>(
  model: string,
  fn: (model: string) => Promise<T>,
  onFallback?: (from: string, to: string, reason: string) => void,
): Promise<{ result: T; model: string; attempts: number }> {
  try {
    const result = await fn(model);
    return { result, model, attempts: 1 };
  } catch (err) {
    if (isFallbackError(err)) {
      const reason = err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80);
      const suggested = getFallbackChain(model)[0];
      // Announce the problem + suggest — but throw so the session stays on the chosen model
      onFallback?.(
        model,
        suggested ?? 'none',
        `${reason}${suggested ? ` — try: /model ${suggested}` : ' — no fallback available'}`,
      );
    }
    throw err;
  }
}
