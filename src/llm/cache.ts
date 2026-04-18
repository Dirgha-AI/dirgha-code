/**
 * llm/cache.ts — Anthropic cache breakpoints
 */
export interface CacheBreakpoint {
  prefix: string;
  tokens: number;
  discount: number;
}

const CACHE_BREAKPOINTS: CacheBreakpoint[] = [
  { prefix: 'system', tokens: 1024, discount: 0.9 },
  { prefix: 'context', tokens: 2048, discount: 0.9 }
];

export function calculateCacheDiscount(
  messages: Array<{ role: string; content: string }>,
  model: string
): { discount: number; savedTokens: number } {
  if (!model.includes('claude-3')) {
    return { discount: 0, savedTokens: 0 }; // Only Anthropic supports
  }
  
  let savedTokens = 0;
  
  for (const msg of messages) {
    const bp = CACHE_BREAKPOINTS.find(b => msg.role === b.prefix);
    if (bp) {
      const tokens = Math.ceil(msg.content.length / 4);
      if (tokens >= bp.tokens) {
        savedTokens += tokens * bp.discount;
      }
    }
  }
  
  return { discount: 0.9, savedTokens: Math.floor(savedTokens) };
}

export function formatCacheStats(saved: number, costPer1K: number): string {
  const savedUsd = (saved / 1000) * costPer1K * 0.9;
  return `Cache: ${saved} tokens cached, ~$${savedUsd.toFixed(3)} saved`;
}
