/**
 * billing/ratelimit.test.ts — Rate limiting tests (simplified)
 */
import { describe, it, expect } from 'vitest';
import { checkRateLimit, recordRequest, resetRateLimit } from './ratelimit.js';

// Helper to get unique user IDs to avoid test pollution
let userCounter = 0;
function getTestUser(): string {
  return `test-user-${Date.now()}-${++userCounter}`;
}

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const user = getTestUser();
    const result = checkRateLimit(user, 'free');
    expect(result.allowed).toBe(true);
    expect(result.remainingRequests).toBeGreaterThan(0);
  });

  it('tracks remaining requests after recording', () => {
    const user = getTestUser();
    // First check creates the window
    const before = checkRateLimit(user, 'free').remainingRequests;
    
    // Record a request
    recordRequest(user, 'free');
    
    const after = checkRateLimit(user, 'free').remainingRequests;
    expect(after).toBe(before - 1);
  });

  it('blocks when limit exceeded', () => {
    const user = getTestUser();
    // Create window
    checkRateLimit(user, 'free');
    
    // Exhaust limit (free tier = 30 requests per minute)
    for (let i = 0; i < 30; i++) {
      recordRequest(user, 'free');
    }
    
    const result = checkRateLimit(user, 'free');
    expect(result.allowed).toBe(false);
    expect(result.remainingRequests).toBe(0);
  });

  it('respects tier differences', () => {
    const user = getTestUser();
    const freeResult = checkRateLimit(user, 'free');
    const proResult = checkRateLimit(user, 'pro');
    
    // Pro tier should have higher limits than free tier
    expect(proResult.remainingRequests).toBeGreaterThan(freeResult.remainingRequests);
    expect(proResult.remainingRequests).toBe(120); // Pro = 120/min
    expect(freeResult.remainingRequests).toBe(30); // Free = 30/min
  });

  it('returns valid reset time', () => {
    const user = getTestUser();
    const result = checkRateLimit(user, 'free');
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.windowMs).toBe(60000);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('recordRequest', () => {
  it('increments request count', () => {
    const user = getTestUser();
    checkRateLimit(user, 'free'); // Create window
    
    const before = checkRateLimit(user, 'free').remainingRequests;
    recordRequest(user, 'free');
    const after = checkRateLimit(user, 'free').remainingRequests;
    
    expect(after).toBe(before - 1);
  });

  it('is no-op if window does not exist', () => {
    const user = getTestUser();
    // Don't create window, just try to record
    expect(() => recordRequest(user, 'free')).not.toThrow();
  });
});

describe('resetRateLimit', () => {
  it('does not throw', () => {
    const user = getTestUser();
    expect(() => resetRateLimit(user, 'free')).not.toThrow();
    expect(() => resetRateLimit(user)).not.toThrow();
  });

  it('allows new requests after reset', () => {
    const user = getTestUser();
    // Setup: create window, exhaust it (free tier = 30)
    checkRateLimit(user, 'free');
    for (let i = 0; i < 30; i++) {
      recordRequest(user, 'free');
    }
    
    // Verify blocked
    const blocked = checkRateLimit(user, 'free');
    expect(blocked.allowed).toBe(false);
    
    // Reset
    resetRateLimit(user, 'free');
    
    // Should be allowed now (fresh window created)
    const after = checkRateLimit(user, 'free');
    expect(after.allowed).toBe(true);
    expect(after.remainingRequests).toBeGreaterThan(0);
  });
});
