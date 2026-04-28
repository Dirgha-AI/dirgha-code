/**
 * Error classifier. Maps any provider error into a structured
 * ClassifiedError with actionable recovery hints. The agent loop and
 * retry policy consult this — no string matching anywhere else.
 */

import type { ClassifiedError, ErrorClassifier } from '../kernel/types.js';
import { ProviderError } from '../providers/iface.js';

export type ErrorReason =
  | 'auth'
  | 'billing'
  | 'rate_limit'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'context_overflow'
  | 'model_not_found'
  | 'format_error'
  | 'tool_schema'
  | 'content_filter'
  | 'unknown';

export function createErrorClassifier(): ErrorClassifier {
  return {
    classify(err: unknown, provider: string, model: string): ClassifiedError {
      const { reason, backoffMs } = diagnose(err);
      void provider;
      void model;
      return {
        reason,
        retryable: isRetryable(reason),
        backoffMs,
        shouldFallback: shouldFallback(reason),
      };
    },
  };
}

function diagnose(err: unknown): { reason: ErrorReason; backoffMs?: number } {
  if (err instanceof ProviderError) {
    const status = err.status ?? 0;
    if (status === 401 || status === 403) return { reason: 'auth' };
    if (status === 402) return { reason: 'billing' };
    if (status === 404) return { reason: 'model_not_found' };
    if (status === 408) return { reason: 'timeout', backoffMs: 1000 };
    if (status === 413) return { reason: 'context_overflow' };
    if (status === 415 || status === 422) return { reason: 'format_error' };
    if (status === 429) return { reason: 'rate_limit', backoffMs: 4000 };
    if (status === 503 || status === 529) return { reason: 'overloaded', backoffMs: 3000 };
    if (status >= 500) return { reason: 'overloaded', backoffMs: 2000 };
    const msg = err.message.toLowerCase();
    if (msg.includes('content filter') || msg.includes('content policy')) return { reason: 'content_filter' };
    if (msg.includes('tool') && msg.includes('schema')) return { reason: 'tool_schema' };
    if (msg.includes('context length')) return { reason: 'context_overflow' };
    return { reason: 'unknown' };
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes('timed out') || message.includes('abort')) return { reason: 'timeout', backoffMs: 1000 };
  if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('network')) return { reason: 'network', backoffMs: 1000 };
  return { reason: 'unknown' };
}

function isRetryable(reason: ErrorReason): boolean {
  return reason === 'rate_limit'
    || reason === 'overloaded'
    || reason === 'timeout'
    || reason === 'network';
}

function shouldFallback(reason: ErrorReason): boolean {
  return reason === 'rate_limit'
    || reason === 'overloaded'
    || reason === 'model_not_found'
    || reason === 'billing';
}
