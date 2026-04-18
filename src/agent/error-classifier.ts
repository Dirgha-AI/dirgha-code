// src/agent/error-classifier.ts — Triage agent errors for adaptive retry strategy
export type ErrorClass = 'transient' | 'permanent' | 'logic' | 'unknown';

const TRANSIENT = [
  /ETIMEDOUT/i, /ECONNRESET/i, /ECONNREFUSED/i,
  /rate.?limit/i, /\b429\b/, /\b503\b/, /\b502\b/,
  /socket hang up/i, /network error/i, /\btimeout\b/i,
  /temporarily unavailable/i, /try again/i,
];

const PERMANENT = [
  /MODULE_NOT_FOUND/i, /Cannot find module/i,
  /\bENOENT\b/, /no such file/i,
  /\bSyntaxError\b/, /Unexpected token/i,
  /command not found/i, /\bEACCES\b/, /permission denied/i,
  /Cannot read propert/i, /is not a function/i,
];

const LOGIC = [
  /\bAssertionError\b/i, /assertion failed/i,
  /\bFAIL\b/, /test.*fail/i, /failing test/i,
  /\bTypeError\b/, /\bReferenceError\b/,
  /expected.*received/i, /does not match/i,
  /tsc.*error/i, /TS\d{4}/,
];

export function classifyError(errorText: string): ErrorClass {
  const t = errorText.slice(0, 3000);
  if (TRANSIENT.some(re => re.test(t))) return 'transient';
  if (LOGIC.some(re => re.test(t))) return 'logic';
  if (PERMANENT.some(re => re.test(t))) return 'permanent';
  return 'unknown';
}

export interface RetryPolicy {
  shouldRetry: boolean;
  delayMs: number;
  replan: boolean;
  escalate: boolean;
  reason: string;
}

export function getRetryPolicy(errorClass: ErrorClass, attempt: number): RetryPolicy {
  switch (errorClass) {
    case 'transient':
      return {
        shouldRetry: attempt < 3,
        delayMs: Math.pow(2, attempt) * 1000,
        replan: false,
        escalate: attempt >= 3,
        reason: `transient — backoff ${Math.pow(2, attempt)}s (attempt ${attempt + 1})`,
      };
    case 'permanent':
      return {
        shouldRetry: attempt < 2,
        delayMs: 500,
        replan: true,
        escalate: attempt >= 2,
        reason: `permanent — replan with error context (attempt ${attempt + 1})`,
      };
    case 'logic':
      return {
        shouldRetry: false,
        delayMs: 0,
        replan: false,
        escalate: true,
        reason: 'logic/test error — escalate for human review',
      };
    default:
      return {
        shouldRetry: attempt < 1,
        delayMs: 1000,
        replan: false,
        escalate: attempt >= 1,
        reason: `unknown error — retry once then escalate (attempt ${attempt + 1})`,
      };
  }
}
