/**
 * providers/rate-limit.ts — NO-OP.
 *
 * Client-side rate limiting has been removed. Providers enforce quotas
 * server-side and return 429; dispatch.ts handles those with cross-provider
 * failover (Fireworks → NVIDIA → OpenRouter → Anthropic), which is the only
 * approach that actually helps when a single account's quota is saturated.
 *
 * These stubs exist so older call sites compile without modification.
 */

import type { ProviderId } from './dispatch.js';

export async function acquire(_provider: ProviderId, _signal?: AbortSignal): Promise<number> {
  return 0;
}

export function snapshot(): Record<string, { rpm: number; available: number }> {
  return {};
}

export function _resetForTests(): void {
  // no-op
}
