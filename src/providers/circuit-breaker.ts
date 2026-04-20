/**
 * providers/circuit-breaker.ts — Circuit breaker for provider health
 *
 * When a provider fails repeatedly, temporarily route around it to reduce
 * latency and avoid hammering a struggling service.
 *
 * Architecture:
 *   CLOSED  → OPEN (after failureThreshold failures)
 *   OPEN    → HALF-OPEN (after recoveryTimeout)
 *   HALF-OPEN → CLOSED (if test calls succeed)
 *             → OPEN (if any test call fails)
 */

import type { ProviderId } from './dispatch.js';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitConfig {
  failureThreshold: number;   // Failures before opening (default: 5)
  recoveryTimeout: number;    // Ms before half-open test (default: 30s)
  halfOpenMaxCalls: number;   // Test calls in half-open (default: 3)
}

interface CircuitRecord {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  halfOpenCalls: number;      // Calls made in half-open state
  consecutiveSuccesses: number;
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30_000,
  halfOpenMaxCalls: 3,
};

/** In-memory circuit state (per-process, like existing rate limiters) */
const circuits = new Map<ProviderId, CircuitRecord>();

function getCircuit(provider: ProviderId): CircuitRecord {
  let record = circuits.get(provider);
  if (!record) {
    record = {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      halfOpenCalls: 0,
      consecutiveSuccesses: 0,
    };
    circuits.set(provider, record);
  }
  return record;
}

function shouldAttemptReset(record: CircuitRecord, config: CircuitConfig): boolean {
  return Date.now() - record.lastFailure >= config.recoveryTimeout;
}

export function recordSuccess(provider: ProviderId): void {
  const record = getCircuit(provider);
  
  if (record.state === 'half-open') {
    record.consecutiveSuccesses++;
    if (record.consecutiveSuccesses >= DEFAULT_CONFIG.halfOpenMaxCalls) {
      // Back to healthy
      record.state = 'closed';
      record.failures = 0;
      record.halfOpenCalls = 0;
      record.consecutiveSuccesses = 0;
    }
  } else {
    record.lastSuccess = Date.now();
    record.failures = 0;
  }
}

export function recordFailure(provider: ProviderId): void {
  const record = getCircuit(provider);
  const now = Date.now();
  
  record.failures++;
  record.lastFailure = now;
  
  if (record.state === 'half-open') {
    // Test call failed - go back to open
    record.state = 'open';
    record.halfOpenCalls = 0;
    record.consecutiveSuccesses = 0;
  } else if (record.state === 'closed' && record.failures >= DEFAULT_CONFIG.failureThreshold) {
    record.state = 'open';
  }
}

export function getCircuitState(provider: ProviderId): CircuitState {
  const record = getCircuit(provider);
  
  if (record.state === 'open' && shouldAttemptReset(record, DEFAULT_CONFIG)) {
    // Transition to half-open for testing
    record.state = 'half-open';
    record.halfOpenCalls = 0;
    record.consecutiveSuccesses = 0;
    return 'half-open';
  }
  
  return record.state;
}

export function isProviderHealthy(provider: ProviderId): boolean {
  const state = getCircuitState(provider);
  return state === 'closed' || state === 'half-open';
}

export function getHealthyProviders(preferred: ProviderId[]): ProviderId[] {
  return preferred.filter(isProviderHealthy);
}

/** Diagnostics for /models health command */
export function getCircuitSnapshot(): Record<ProviderId, {
  state: CircuitState;
  failures: number;
  lastFailure: number;
}> {
  const snapshot: Record<string, { state: CircuitState; failures: number; lastFailure: number }> = {};
  for (const [provider, record] of circuits) {
    snapshot[provider] = {
      state: getCircuitState(provider as ProviderId), // Recalculate for half-open transitions
      failures: record.failures,
      lastFailure: record.lastFailure,
    };
  }
  return snapshot;
}

/** Alias with underscore-normalized state names (for test compatibility) */
export function getProviderState(provider: ProviderId): 'closed' | 'open' | 'half_open' {
  const state = getCircuitState(provider);
  return state === 'half-open' ? 'half_open' : state;
}

/** Testing hook - reset all circuits */
export function _resetCircuits(): void {
  circuits.clear();
}
