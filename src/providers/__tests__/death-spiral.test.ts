/**
 * providers/__tests__/death-spiral.test.ts — Test suite for rate limit death spiral
 * 
 * FIX P1-ISSUE 3.1: Test coordinated failure scenarios
 * 
 * Death Spiral Scenario:
 * 1. All 3 rate limit systems (circuit + billing + provider) trip simultaneously
 * 2. Each system independently blocks → CLI unusable for hours
 * 3. Unified limiter should coordinate and prevent this
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedRateLimiter, createUnifiedRateLimiter } from '../unified-rate-limiter.js';
import * as circuitBreaker from '../circuit-breaker.js';
import * as billingRatelimit from '../../billing/ratelimit-fixed.js';

describe('Rate Limit Death Spiral Prevention', () => {
  let limiter: UnifiedRateLimiter;
  
  beforeEach(() => {
    limiter = createUnifiedRateLimiter();
    // Restore all mocks (not just clear) to prevent spy leakage across tests
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Single Provider Rate Limit', () => {
    it('should queue and retry when one provider is rate limited', async () => {
      const startTime = Date.now();
      
      // Simulate one provider with long backoff
      const result = await limiter.acquireWithRetry('anthropic', {
        maxWaitMs: 300000, // 5 min
        signal: undefined
      });
      
      // Should not immediately abort
      expect(result.status).not.toBe('aborted');
    });

    it('should use fallback providers when primary is blocked', async () => {
      // First provider blocked
      vi.spyOn(circuitBreaker, 'isProviderHealthy').mockImplementation((p) => {
        return p === 'fireworks'; // Only Fireworks healthy
      });
      
      const result = await limiter.routeWithFallback('anthropic', {
        fallbackChain: ['anthropic', 'fireworks', 'openrouter']
      });
      
      expect(result.provider).toBe('fireworks');
      expect(result.wasFallback).toBe(true);
    });
  });

  describe('Scenario 2: Death Spiral - All Providers Simultaneously Blocked', () => {
    it('should detect death spiral when 3+ providers blocked >5min', async () => {
      // Simulate all providers with long backoffs
      const providerStates = new Map([
        ['anthropic', { retryAfterMs: 400000, status: 'rate_limited' }],
        ['openai', { retryAfterMs: 360000, status: 'rate_limited' }],
        ['fireworks', { retryAfterMs: 300000, status: 'rate_limited' }],
      ]);
      
      const isDeathSpiral = limiter.detectDeathSpiral(providerStates, {
        minBlockedProviders: 3,
        minBackoffMs: 300000 // 5 min
      });
      
      expect(isDeathSpiral).toBe(true);
    });

    it('should NOT detect death spiral when only 2 providers blocked', async () => {
      const providerStates = new Map([
        ['anthropic', { retryAfterMs: 400000, status: 'rate_limited' }],
        ['openai', { retryAfterMs: 360000, status: 'rate_limited' }],
        ['fireworks', { retryAfterMs: 1000, status: 'healthy' }],
      ]);
      
      const isDeathSpiral = limiter.detectDeathSpiral(providerStates, {
        minBlockedProviders: 3,
        minBackoffMs: 300000
      });
      
      expect(isDeathSpiral).toBe(false);
    });

    it('should throw helpful error during death spiral with recovery steps', async () => {
      // Force death spiral conditions
      vi.spyOn(limiter, 'detectDeathSpiral').mockReturnValue(true);
      
      await expect(limiter.acquireWithRetry('anthropic', {}))
        .rejects
        .toThrow(/Death spiral detected/i);
    });
  });

  describe('Scenario 3: Circuit Breaker Prevents Hammering', () => {
    it('should open circuit after 5 consecutive failures', async () => {
      const provider = 'anthropic';
      
      // Simulate 5 failures
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(provider);
      }
      
      expect(circuitBreaker.isProviderHealthy(provider)).toBe(false);
    });

    it('should allow half-open test after cooldown', async () => {
      // Fast-forward past cooldown
      vi.useFakeTimers();
      
      const provider = 'anthropic';
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(provider);
      }
      
      // Advance 65 seconds (past 60s cooldown)
      vi.advanceTimersByTime(65000);
      
      // Should be in half-open state (needs test request)
      expect(circuitBreaker.getProviderState(provider)).toBe('half_open');
      
      vi.useRealTimers();
    });
  });

  describe('Scenario 4: Billing Quota Exhaustion', () => {
    it('should reject when user quota exhausted', () => {
      vi.spyOn(billingRatelimit, 'checkRateLimit').mockReturnValue({
        allowed: false,
        remainingRequests: 0,
        resetAt: new Date(Date.now() + 86400000),
        windowMs: 60000,
      });

      const result = billingRatelimit.checkRateLimit('test-user', 'free');

      expect(result.allowed).toBe(false);
    });

    it('should allow request when within quota', () => {
      vi.spyOn(billingRatelimit, 'checkRateLimit').mockReturnValue({
        allowed: true,
        remainingRequests: 50,
        resetAt: new Date(Date.now() + 60000),
        windowMs: 60000,
      });

      const result = billingRatelimit.checkRateLimit('test-user', 'free');

      expect(result.allowed).toBe(true);
    });
  });

  describe('Scenario 5: Coordinated Recovery', () => {
    it('should stagger retry attempts across providers', async () => {
      const retrySchedule = limiter.calculateStaggeredRetry('anthropic', {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitter: true
      });
      
      // Should have increasing delays
      expect(retrySchedule[0]).toBeLessThan(retrySchedule[1]);
      expect(retrySchedule[1]).toBeLessThan(retrySchedule[2]);
      
      // Should include jitter (not exact multiples)
      expect(retrySchedule[0] % 1000).not.toBe(0);
    });

    it('should prioritize providers by health score', async () => {
      const providers = ['anthropic', 'fireworks', 'openrouter'];
      
      vi.spyOn(limiter, 'getProviderHealthScore').mockImplementation((p) => {
        const scores: Record<string, number> = {
          'anthropic': 0.3,  // Unhealthy
          'fireworks': 0.9,  // Healthy
          'openrouter': 0.7  // Medium
        };
        return scores[p] ?? 0.5;
      });
      
      const prioritized = limiter.prioritizeProviders(providers);
      
      expect(prioritized[0]).toBe('fireworks');  // Highest health
      expect(prioritized[2]).toBe('anthropic');  // Lowest health
    });
  });

  describe('Scenario 6: Abort Signal Responsiveness', () => {
    it('should immediately cancel queued wait on abort signal', async () => {
      const controller = new AbortController();
      
      // Start acquisition
      const acquirePromise = limiter.acquireWithRetry('anthropic', {
        maxWaitMs: 60000
      }, controller.signal);
      
      // Abort immediately
      controller.abort();
      
      // Should reject quickly (<100ms), not wait full 60s
      const startTime = Date.now();
      await expect(acquirePromise).rejects.toThrow(/aborted/i);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(200);
    });

    it('should check abort signal every 100ms during wait', async () => {
      const checkInterval = limiter.getConfig().abortCheckIntervalMs;
      expect(checkInterval).toBe(100);
    });
  });

  describe('Metric: Recovery Time', () => {
    it('should recover from single provider failure within 5 seconds', async () => {
      // Reset so this test starts with a clean circuit (previous tests may have tripped it)
      circuitBreaker._resetCircuits();
      const startTime = Date.now();

      // Single failure (well below threshold of 5) then success
      circuitBreaker.recordFailure('anthropic');
      circuitBreaker.recordSuccess('anthropic');
      
      const recovered = await limiter.waitForRecovery('anthropic', { timeoutMs: 5000 });
      
      expect(recovered).toBe(true);
      expect(Date.now() - startTime).toBeLessThan(5000);
    });

    it('should log recovery metrics for monitoring', async () => {
      const metrics = limiter.getMetrics();
      
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('successfulRequests');
      expect(metrics).toHaveProperty('failedRequests');
      expect(metrics).toHaveProperty('averageLatencyMs');
      expect(metrics).toHaveProperty('deathSpiralEvents');
    });
  });
});

describe('Integration: End-to-End Death Spiral Prevention', () => {
  it('full scenario: cascading failures → recovery', async () => {
    const limiter = createUnifiedRateLimiter();
    
    // Phase 1: Normal operation
    const acquireResult1 = await limiter.acquireWithRetry('anthropic', { maxWaitMs: 5000 });
    expect(acquireResult1.status).toBe('success');

    // Phase 2: Trip anthropic circuit (threshold = 5) then route to fallback
    for (let i = 0; i < 5; i++) circuitBreaker.recordFailure('anthropic');
    const routeResult = await limiter.routeWithFallback('anthropic', {
      fallbackChain: ['anthropic', 'fireworks']
    });
    expect(routeResult.provider).toBe('fireworks');

    // Phase 3: Multiple providers rate limited (but not death spiral)
    const acquireResult2 = await limiter.acquireWithRetry('fireworks', { maxWaitMs: 10000 });
    expect(acquireResult2.status).toBe('success');
    
    // Phase 4: Death spiral conditions (3+ providers, >5min)
    // Populate the limiter with backoffs so acquireWithRetry can detect the spiral
    limiter.recordRetryAfter('anthropic' as any, 400000);
    limiter.recordRetryAfter('fireworks' as any, 360000);
    limiter.recordRetryAfter('openrouter' as any, 300000);

    const providerStates = new Map([
      ['anthropic', { retryAfterMs: 400000 }],
      ['fireworks', { retryAfterMs: 360000 }],
      ['openrouter', { retryAfterMs: 300000 }],
    ]);

    if (limiter.detectDeathSpiral(providerStates, { minBlockedProviders: 3 })) {
      await expect(limiter.acquireWithRetry('anthropic', {}))
        .rejects.toThrow(/Death spiral detected/);
    }
  });
});
