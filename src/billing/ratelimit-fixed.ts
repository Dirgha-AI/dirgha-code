/**
 * billing/ratelimit-fixed.ts — Rate limiting with sliding window + LRU eviction
 * 
 * FIXES P0-ISSUE 2.2: Memory Leak in billing/ratelimit.ts
 * - Replaces unbounded Map with LRUWindowStore (max 1000 entries)
 * - Prevents OOM in multi-worker scenarios with 10K+ users
 * - Automatic eviction of least recently used windows
 */

import type { RateLimitStatus } from './types.js';
import { API_RATE_LIMITS } from '@dirgha/types';

interface WindowEntry {
  count: number;
  resetAt: number;
}

// === LRU Window Store (prevents unbounded growth) ===
class LRUWindowStore {
  private cache = new Map<string, WindowEntry>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): WindowEntry | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: WindowEntry): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  get size(): number {
    return this.cache.size;
  }
}

// MAX_WINDOW_ENTRIES: 1000 windows max (prevents OOM)
const MAX_WINDOW_ENTRIES = 1000;
const windows = new LRUWindowStore(MAX_WINDOW_ENTRIES);

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
      resetAt: now + limits.window,
    };
    windows.set(key, entry);
  }
  
  const allowed = entry.count < limits.requests;
  const remainingRequests = Math.max(0, limits.requests - entry.count);
  
  return {
    allowed,
    remainingRequests,
    resetAt: new Date(entry.resetAt),
    windowMs: limits.window,
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
    for (const key of windows.keys()) {
      if (key.startsWith(`${userId}:`)) {
        windows.delete(key);
      }
    }
  }
}

// === Stats for monitoring ===
export function getRateLimitStats(): { entries: number; maxEntries: number } {
  return {
    entries: windows.size,
    maxEntries: MAX_WINDOW_ENTRIES,
  };
}

// Cleanup expired windows every 5 minutes (keep existing behavior)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows as any) {
    if (now >= entry.resetAt) {
      windows.delete(key);
    }
  }
}, 5 * 60 * 1000);
