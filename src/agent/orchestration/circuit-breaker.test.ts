// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';

describe('Circuit Breaker', () => {
  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => { throw new Error('fail'); }))
        .rejects.toThrow();
    }
    
    await expect(cb.execute(() => 'success'))
      .rejects.toThrow(CircuitBreakerOpenError);
  });

  it('closes after success in half-open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100 });
    
    await expect(cb.execute(() => { throw new Error('fail'); }))
      .rejects.toThrow();
    
    await new Promise(r => setTimeout(r, 150));
    
    const result = await cb.execute(() => 'success');
    expect(result).toBe('success');
  });
});
