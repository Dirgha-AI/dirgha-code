/**
 * providers/rate-limit.ts — Optional per-provider client-side token bucket.
 *
 * DISABLED BY DEFAULT. Providers already enforce limits server-side and return
 * 429; dispatch.ts retries those with backoff, which is the correct layer.
 * For a multi-user product, throttling belongs in the gateway (api.dirgha.ai),
 * not in every CLI install — so this module is opt-in for power users on a
 * strict free tier (e.g., OpenRouter :free daily caps) who want to avoid
 * tripping the remote limit at all.
 *
 * Enable per provider via env (0 = off, the default):
 *
 *   DIRGHA_RATE_LIMIT_OPENROUTER=20
 *   DIRGHA_RATE_LIMIT_GEMINI=10
 *   DIRGHA_RATE_LIMIT_FIREWORKS=0        # leave off — retry handles bursts
 */

import type { ProviderId } from './dispatch.js';
import { PROVIDER_RATE_LIMITS } from '@dirgha/types';

interface Bucket {
  rpm: number;          // effective requests per minute; 0 = disabled
  tokens: number;       // current available tokens
  lastRefill: number;   // ms timestamp of last refill calculation
}

const buckets = new Map<ProviderId, Bucket>();

function resolveRpm(provider: ProviderId): number {
  const envKey = `DIRGHA_RATE_LIMIT_${provider.toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw !== undefined) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return PROVIDER_RATE_LIMITS[provider] ?? 0;
}

function getBucket(provider: ProviderId): Bucket {
  let b = buckets.get(provider);
  if (!b) {
    const rpm = resolveRpm(provider);
    b = { rpm, tokens: rpm, lastRefill: Date.now() };
    buckets.set(provider, b);
  }
  return b;
}

function refill(b: Bucket, now: number): void {
  if (b.rpm === 0) return;
  const elapsed = now - b.lastRefill;
  if (elapsed <= 0) return;
  const added = (elapsed / 60_000) * b.rpm;
  b.tokens = Math.min(b.rpm, b.tokens + added);
  b.lastRefill = now;
}

/**
 * Acquire one token for the provider. Awaits as long as necessary.
 * Returns the ms the caller waited (0 if immediate).
 * 
 * FIX P1-ISSUE: Added abort signal support for responsive Ctrl+C cancellation
 */
export async function acquire(provider: ProviderId, signal?: AbortSignal): Promise<number> {
  const b = getBucket(provider);
  if (b.rpm === 0) return 0; // disabled

  const start = Date.now();
  
  // Check initial abort
  if (signal?.aborted) {
    throw Object.assign(new Error('Rate limit acquisition aborted'), { name: 'AbortError' });
  }

  // Loop because multiple callers may wake simultaneously and race for the same token.
  for (;;) {
    const now = Date.now();
    refill(b, now);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return now - start;
    }
    
    // Check abort before sleeping
    if (signal?.aborted) {
      throw Object.assign(new Error('Rate limit acquisition aborted'), { name: 'AbortError' });
    }
    
    // Time until one token is available: (1 - tokens) / rpm minutes → ms
    const msNeeded = Math.ceil(((1 - b.tokens) / b.rpm) * 60_000);
    const sleepMs = Math.min(msNeeded, 5000);
    
    // Responsive abort checking - check every 100ms
    for (let slept = 0; slept < sleepMs; slept += 100) {
      if (signal?.aborted) {
        throw Object.assign(new Error('Rate limit acquisition aborted'), { name: 'AbortError' });
      }
      await new Promise(r => setTimeout(r, Math.min(100, sleepMs - slept)));
    }
  }
}

/** Diagnostics — used by `dirgha models health` to show current state. */
export function snapshot(): Record<string, { rpm: number; available: number }> {
  const out: Record<string, { rpm: number; available: number }> = {};
  const now = Date.now();
  for (const [provider, b] of buckets) {
    refill(b, now);
    out[provider] = { rpm: b.rpm, available: Math.floor(b.tokens) };
  }
  return out;
}

/** Testing hook — clear state between unit tests. */
export function _resetForTests(): void {
  buckets.clear();
}
