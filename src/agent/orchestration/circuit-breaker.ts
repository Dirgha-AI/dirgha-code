/**
 * agent/orchestration/circuit-breaker.ts — Circuit breaker pattern for resilience
 * 
 * Implements circuit breaker pattern for protecting downstream services.
 * Prevents cascade failures in multi-agent systems.
 * 
 * @module agent/orchestration/circuit-breaker
 */

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening
  successThreshold: number;      // Successes before closing from half-open
  timeoutMs: number;             // Time before attempting reset
  resetTimeoutMs: number;      // Time before half-open
  halfOpenMaxCalls: number;      // Max calls in half-open state
}

/**
 * Circuit breaker stats
 */
export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  rejectedCalls: number;
}

/**
 * Circuit breaker for protecting operations
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime?: number;
  private totalCalls = 0;
  private rejectedCalls = 0;
  private halfOpenCalls = 0;
  private resetTimer?: NodeJS.Timeout;
  
  private readonly config: CircuitBreakerConfig;
  
  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      timeoutMs: 30000,
      resetTimeoutMs: 60000,
      halfOpenMaxCalls: 3,
      ...config
    };
  }
  
  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        this.rejectedCalls++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN. Retry after ${this.getRemainingTimeout()}ms`
        );
      }
    }
    
    // In half-open, limit concurrent calls
    if (this.state === 'half-open') {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.rejectedCalls++;
        throw new CircuitBreakerOpenError(
          'Circuit breaker is HALF-OPEN - too many concurrent test calls'
        );
      }
      this.halfOpenCalls++;
    }
    
    this.totalCalls++;
    
    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.state === 'half-open') {
        this.halfOpenCalls--;
      }
    }
  }
  
  /**
   * Get current stats
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls
    };
  }
  
  /**
   * Force circuit open (for maintenance)
   */
  forceOpen(): void {
    this.transitionTo('open');
  }
  
  /**
   * Force circuit closed (reset)
   */
  forceClose(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCalls = 0;
    this.clearResetTimer();
  }
  
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), this.config.timeoutMs)
      )
    ]);
  }
  
  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    
    if (this.state === 'half-open') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }
  
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    
    if (newState === 'open') {
      this.scheduleReset();
    } else if (newState === 'closed') {
      this.clearResetTimer();
      this.failures = 0;
      this.consecutiveSuccesses = 0;
      this.halfOpenCalls = 0;
    } else if (newState === 'half-open') {
      this.consecutiveSuccesses = 0;
      this.halfOpenCalls = 0;
    }
    
    // Emit event for monitoring
    this.emitTransition(oldState, newState);
  }
  
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }
  
  private getRemainingTimeout(): number {
    if (!this.lastFailureTime) return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }
  
  private scheduleReset(): void {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      if (this.state === 'open') {
        this.transitionTo('half-open');
      }
    }, this.config.resetTimeoutMs);
  }
  
  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }
  
  private emitTransition(from: CircuitState, to: CircuitState): void {
    // Could emit to event bus for monitoring
    // For now, just log if in debug mode
    if (process.env.DEBUG === '1') {
      console.log(`[CircuitBreaker] ${from} -> ${to}`);
    }
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Bulkhead pattern for resource isolation
 */
export class Bulkhead {
  private queue: Array<{
    operation: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private activeCount = 0;
  private queueSize: number;
  private maxConcurrency: number;
  
  constructor(config: { maxConcurrency: number; maxQueue: number }) {
    this.maxConcurrency = config.maxConcurrency;
    this.queueSize = config.maxQueue;
  }
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.activeCount < this.maxConcurrency) {
      return this.executeNow(operation);
    }
    
    // Check queue capacity
    if (this.queue.length >= this.queueSize) {
      throw new BulkheadFullError('Bulkhead queue is full');
    }
    
    // Queue the operation
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        operation,
        resolve: resolve as (value: unknown) => void,
        reject
      });
    });
  }
  
  getStats(): { active: number; queued: number; available: number } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      available: this.maxConcurrency - this.activeCount
    };
  }
  
  private async executeNow<T>(operation: () => Promise<T>): Promise<T> {
    this.activeCount++;
    
    try {
      const result = await operation();
      return result;
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }
  
  private processQueue(): void {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrency) {
      return;
    }
    
    const next = this.queue.shift();
    if (!next) return;
    
    this.executeNow(next.operation)
      .then(next.resolve)
      .catch(next.reject);
  }
}

/**
 * Error thrown when bulkhead is full
 */
export class BulkheadFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadFullError';
  }
}

/**
 * Rate limiter for throttling operations
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  
  constructor(maxTokens: number, windowMs: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = maxTokens / windowMs;
  }
  
  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    
    // Wait for token
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise(r => setTimeout(r, waitMs));
    return this.acquire();
  }
  
  tryAcquire(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    
    return false;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
