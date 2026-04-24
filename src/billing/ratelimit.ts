/**
 * billing/ratelimit.ts — Rate limiting with sliding window
 */
import type { RateLimitStatus } from './types.js';
import { API_RATE_LIMITS } from '../config/rate-limits.js';

interface WindowEntry {
  count: number;
  resetAt: number;
}

// In-memory windows (per-process, resets on restart)
const windows = new Map<string, WindowEntry>();

function getWindowKey(userId: string, tier: string): string {
  return `${userId}:${tier}`;
}

export function checkRateLimit(
  userId: string,
  tier: string = 'free'
): RateLimitStatus {
  const limits = API_RATE_LIMITS[tier] ?? API_RATE_LIMITS.free;
  const key = getWindowKey(userId, tier);
  const now = Date.now();
  
  let entry = windows.get(key);
  
  // Reset window if expired
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + limits.windowMs,
    };
    windows.set(key, entry);
  }
  
  const allowed = entry.count < limits.requests;
  const remainingRequests = Math.max(0, limits.requests - entry.count);
  
  return {
    allowed,
    remainingRequests,
    resetAt: new Date(entry.resetAt),
    windowMs: limits.windowMs,
  };
}

export function recordRequest(userId: string, tier: string = 'free'): void {
  const key = getWindowKey(userId, tier);
  const entry = windows.get(key);
  if (entry) {
    entry.count++;
  }
}

export function resetRateLimit(userId: string, tier?: string): void {
  if (tier) {
    windows.delete(getWindowKey(userId, tier));
  } else {
    // Clear all tiers for user
    for (const [key] of windows) {
      if (key.startsWith(`${userId}:`)) {
        windows.delete(key);
      }
    }
  }
}

// Cleanup expired windows every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (now >= entry.resetAt) {
      windows.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();
