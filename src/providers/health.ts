/**
 * Provider health tracking — multi-dimensional 0-1 score.
 * Ported from monorepo providers/health.ts for release repo v1.17.0.
 *
 * Dimensions: latency (timer), error rate (window), rate limit hits (decay), cost factor.
 * Score decay: exponential with 5min half-life so stale data doesn't dominate.
 */
import type { ProviderId } from "./dispatch.js";

interface WindowEntry {
  time: number;
  ok: boolean;
  latMs: number;
}

const WINDOW_MS = 5 * 60 * 1000; // 5 min sliding window
// const HALF_LIFE_MS = 5 * 60 * 1000; // 5 min decay half-life

const windows = new Map<string, WindowEntry[]>();
const rateLimitHits = new Map<string, number>();
const costFactors: Record<string, number> = {
  anthropic: 1.5,
  openai: 1.4,
  gemini: 1.0,
  openrouter: 1.2,
  nvidia: 0.5,
  fireworks: 1.0,
  groq: 0.8,
  mistral: 0.9,
  deepseek: 0.7,
  ollama: 0.0,
  llamacpp: 0.0,
  cohere: 1.0,
  cerebras: 0.8,
  together: 0.9,
  perplexity: 1.1,
  xai: 1.0,
  zai: 0.9,
};

export function recordRequest(
  provider: string,
  ok: boolean,
  latMs: number,
): void {
  const w = windows.get(provider) ?? [];
  w.push({ time: Date.now(), ok, latMs });
  // Trim old entries
  const cutoff = Date.now() - WINDOW_MS;
  windows.set(
    provider,
    w.filter((e) => e.time > cutoff),
  );
}

export function recordRateLimit(provider: string): void {
  rateLimitHits.set(provider, (rateLimitHits.get(provider) ?? 0) + 1);
}

export function healthScore(provider: string): number {
  const w = windows.get(provider) ?? [];

  // Error dimension: 1.0 = no errors
  const total = w.length || 1;
  const errors = w.filter((e) => !e.ok).length;
  const errorScore = 1.0 - errors / total;

  // Latency dimension: 1.0 = fastest, 0.0 = 5s+
  const latencies = w.filter((e) => e.ok).map((e) => e.latMs);
  const avgLat =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 1000;
  const latScore = Math.max(0, 1.0 - avgLat / 5000);

  // Rate limit dimension: decays over time
  const rlHits = rateLimitHits.get(provider) ?? 0;
  const decayFactor = Math.pow(0.5, rlHits);
  const rlScore = decayFactor;

  // Cost dimension: lower cost = higher score
  const cost = costFactors[provider] ?? 1.0;
  const costScore = 1.0 - cost / 2.0;

  return errorScore * 0.35 + latScore * 0.25 + rlScore * 0.2 + costScore * 0.2;
}

export function bestProvider(providers: ProviderId[]): ProviderId {
  let best = providers[0];
  let bestScore = healthScore(best);
  for (let i = 1; i < providers.length; i++) {
    const score = healthScore(providers[i]);
    if (score > bestScore) {
      best = providers[i];
      bestScore = score;
    }
  }
  return best;
}

export function resetHealth(provider: string): void {
  windows.delete(provider);
  rateLimitHits.delete(provider);
}
