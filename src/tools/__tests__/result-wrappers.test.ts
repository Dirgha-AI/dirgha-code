import { describe, it, expect } from 'vitest';
import {
  wrapLegacyResult,
  looksLikeV2Result,
  internalError,
} from '../result-wrappers.js';

describe('wrapLegacyResult', () => {
  it('T01 wrapLegacy_null_returns_internal_error', () => {
    const result = wrapLegacyResult(null);
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.kind', 'internal');
  });

  it('T02 wrapLegacy_undefined_returns_internal_error', () => {
    const result = wrapLegacyResult(undefined);
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.kind', 'internal');
  });

  it('T03 wrapLegacy_string_returns_ok_with_content', () => {
    const result = wrapLegacyResult('hello');
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('content', 'hello');
    expect(result).toHaveProperty('value', undefined);
  });

  it('T04 wrapLegacy_number_returns_internal_error', () => {
    const result = wrapLegacyResult(42);
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.kind', 'internal');
  });

  it('T05 wrapLegacy_v1_success', () => {
    const result = wrapLegacyResult({ content: 'ok', isError: false });
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('content', 'ok');
    expect(result).toHaveProperty('value', undefined);
    // isError mirrors !ok for legacy consumer compatibility
    expect(result).toHaveProperty('isError', false);
  });

  it('T06 wrapLegacy_v1_success_with_data', () => {
    const result = wrapLegacyResult({ content: 'ok', isError: false, data: { x: 1 } });
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('value', { x: 1 });
  });

  it('T07 wrapLegacy_v1_error', () => {
    const result = wrapLegacyResult({ content: 'denied', isError: true });
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.kind', 'external');
    expect(result).toHaveProperty('error.message', 'denied');
  });

  it('T08 wrapLegacy_v1_error_custom_fallback', () => {
    const result = wrapLegacyResult({ content: 'oops', isError: true }, 'internal');
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.kind', 'internal');
  });

  it('T09 wrapLegacy_v2_pass_through_ok', () => {
    const input = { ok: true, value: 'x', content: 'y', isError: false };
    const result = wrapLegacyResult(input);
    expect(result).toStrictEqual(input);
  });

  it('T10 wrapLegacy_v2_pass_through_error', () => {
    const input = {
      ok: false,
      isError: true,
      content: 'fail',
      error: { kind: 'timeout' as const, message: 'm', retryable: true, fatal_to_loop: false },
    };
    const result = wrapLegacyResult(input);
    expect(result).toStrictEqual(input);
  });

  it('T11 wrapLegacy_preserves_metadata', () => {
    const result = wrapLegacyResult({ content: 'ok', isError: false, metadata: { a: 1 } });
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('metadata', { a: 1 });
  });

  it('T12 wrapLegacy_preserves_durationMs', () => {
    const result = wrapLegacyResult({ content: 'ok', isError: false, durationMs: 42 });
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('durationMs', 42);
  });
});

describe('looksLikeV2Result', () => {
  it('T13 looksLikeV2_true_for_v2', () => {
    expect(looksLikeV2Result({ ok: true })).toBe(true);
    expect(looksLikeV2Result({ ok: false, error: { kind: 'timeout', message: '', retryable: false, fatal_to_loop: false } })).toBe(true);
  });

  it('T14 looksLikeV2_false_for_v1', () => {
    expect(looksLikeV2Result({ content: 'x', isError: false })).toBe(false);
  });

  it('T15 looksLikeV2_false_for_primitives', () => {
    expect(looksLikeV2Result(null)).toBe(false);
    expect(looksLikeV2Result(undefined)).toBe(false);
    expect(looksLikeV2Result('str')).toBe(false);
    expect(looksLikeV2Result(42)).toBe(false);
  });
});

describe('internalError', () => {
  it('T16 internalError_basic', () => {
    const result = internalError('timeout', 'timed out');
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.kind', 'timeout');
    expect(result).toHaveProperty('error.message', 'timed out');
    expect(result).toHaveProperty('content', 'timed out');
  });

  it('T17 internalError_with_retryable', () => {
    const result = internalError('rate_limit', 'wait', 'rate limited', { retryable: true });
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error.retryable', true);
  });
});
