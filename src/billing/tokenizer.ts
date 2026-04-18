/**
 * billing/tokenizer.ts — Simple tokenizer for token estimation
 * 
 * Uses ~4 chars/token heuristic with word-based adjustments.
 * Not exact but fast and sufficient for billing estimates.
 */

const WORD_TOKEN_RATIO = 0.75; // Avg 0.75 tokens per word in English
const CHAR_TOKEN_RATIO = 0.25; // Avg 4 chars per token

export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Fast path for ASCII
  if (isAscii(text)) {
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const charEstimate = Math.ceil(text.length * CHAR_TOKEN_RATIO);
    const wordEstimate = Math.ceil(wordCount / WORD_TOKEN_RATIO);
    // Weight toward whichever is higher (handles code vs prose)
    return Math.max(charEstimate, wordEstimate, 1);
  }
  
  // Unicode: use character count with higher ratio
  return Math.ceil(text.length * 0.5);
}

function isAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return false;
  }
  return true;
}

// Cache for repeated estimations
const cache = new Map<string, number>();
const MAX_CACHE_SIZE = 10_000;

export function estimateTokensCached(text: string): number {
  if (cache.has(text)) {
    return cache.get(text)!;
  }
  const result = estimateTokens(text);
  if (cache.size < MAX_CACHE_SIZE) {
    cache.set(text, result);
  }
  return result;
}

export function clearTokenCache(): void {
  cache.clear();
}
