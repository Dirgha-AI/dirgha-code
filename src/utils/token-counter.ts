const tokenCache = new Map<string, number>();
const MAX_CACHE_SIZE = 5000;
const DEFAULT_CONTEXT_LIMIT = 100000;

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic
  'claude-opus-4-7':   1000000,
  'claude-opus-4-6':   200000,
  'claude-sonnet-4-6': 200000,
  'claude-haiku-4-5':  200000,
  // OpenAI
  'gpt-5.4':       400000,
  'gpt-5.4-mini':  128000,
  'gpt-5.4-nano':  128000,
  'o4-mini':       200000,
  'o3':            200000,
  // Gemini
  'gemini-3.1-pro-preview': 2000000,
  'gemini-3.1-flash':       1000000,
  // xAI
  'grok-4': 256000,
  // Fireworks
  'accounts/fireworks/routers/kimi-k2p5-turbo':  262144,
  'accounts/fireworks/models/deepseek-v3p2':     128000,
  'accounts/fireworks/models/qwen3-max':         262144,
  'accounts/fireworks/models/llama-v4-maverick': 1000000,
  // NVIDIA
  'minimax/minimax-m2.7':                    256000,
  'minimax/minimax-m2':                      256000,
  'meta/llama-4-maverick-17b-128e-instruct': 1000000,
  'meta/llama-4-scout-17b-16e-instruct':     10000000,
  // Groq
  'meta-llama/llama-4-scout-17b-16e-instruct': 10000000,
  'llama-3.3-70b-versatile':                   128000,
  'qwen-qwen3-32b':                            128000,
  // Mistral
  'mistral-large-2':  128000,
  'codestral-latest': 128000,
};

/** Estimate token count (1 token ≈ 4 chars). LRU cached by first 100 chars + length. */
export function estimateTokens(text: string): number {
  const cacheKey = `${text.slice(0, 100)}|${text.length}`;
  if (tokenCache.has(cacheKey)) return tokenCache.get(cacheKey)!;

  const tokens = Math.ceil(text.length / 4);
  if (tokenCache.size >= MAX_CACHE_SIZE) {
    const firstKey = tokenCache.keys().next().value as string;
    tokenCache.delete(firstKey);
  }
  tokenCache.set(cacheKey, tokens);
  return tokens;
}

/** Sum token estimates for all messages. Handles string or array content. */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: any }>
): number {
  return messages.reduce((total, msg) => {
    let contentStr = '';
    if (typeof msg.content === 'string') {
      contentStr = msg.content;
    } else if (Array.isArray(msg.content)) {
      contentStr = msg.content
        .map((b: any) =>
          typeof b === 'string' ? b : (typeof b.text === 'string' ? b.text : JSON.stringify(b))
        )
        .join('');
    } else if (typeof msg.content === 'object' && msg.content !== null) {
      contentStr = JSON.stringify(msg.content);
    }
    return total + (contentStr ? estimateTokens(contentStr) : 0);
  }, 0);
}

/** Get context limit for a model (fallback: 100000). */
export function getContextLimit(modelId: string): number {
  return MODEL_CONTEXT_LIMITS[modelId] ?? DEFAULT_CONTEXT_LIMIT;
}

/** Check if estimated tokens < threshold% of context limit.
 *  Default threshold: 93% — production-validated.
 *  Source: github.com/thtskaran/claude-code-analysis (2025)
 */
export function isBelowThreshold(
  messages: Array<{ role: string; content: any }>,
  modelId: string,
  thresholdPct = 0.93 // Production-validated threshold
): boolean {
  const estimated = estimateMessagesTokens(messages);
  const limit = getContextLimit(modelId);
  return estimated < limit * thresholdPct;
}
