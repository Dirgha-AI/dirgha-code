/**
 * Unified rate-limit tables — vendored locally so the CLI builds as a
 * standalone package with no workspace-only dependency.
 */

export interface RateLimitTier {
  requests: number;
  windowMs: number;
}

/** API/gateway request limits per authentication tier. */
export const API_RATE_LIMITS: Record<string, RateLimitTier> = {
  anonymous: { requests: 0,   windowMs: 60_000 },
  guest:     { requests: 100, windowMs: 60_000 },
  free:      { requests: 30,  windowMs: 60_000 },
  pro:       { requests: 120, windowMs: 60_000 },
  team:      { requests: 600, windowMs: 60_000 },
};

/**
 * Client-side provider limits (requests/minute). All zero — providers
 * enforce their own limits server-side; 429s are surfaced, not retried.
 */
export const PROVIDER_RATE_LIMITS: Record<string, number> = {
  fireworks:  0,
  openrouter: 0,
  gateway:    0,
  anthropic:  0,
  openai:     0,
  gemini:     0,
  nvidia:     0,
  groq:       0,
  xai:        0,
  mistral:    0,
  cohere:     0,
  perplexity: 0,
  togetherai: 0,
  deepinfra:  0,
  ollama:     0,
};
