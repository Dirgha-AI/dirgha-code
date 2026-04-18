/**
 * agent/routing.test.ts — Unit tests for model routing + query classification
 */
import { describe, it, expect } from 'vitest';

describe('classifyQuery', () => {
  it('classifies single-word trivial commands as fast', async () => {
    const { classifyQuery } = await import('./routing.js');
    expect(classifyQuery('yes', [])).toBe('fast');
    expect(classifyQuery('ok', [])).toBe('fast');
    expect(classifyQuery('no', [])).toBe('fast');
  });

  it('classifies complexity keywords as full', async () => {
    const { classifyQuery } = await import('./routing.js');
    expect(classifyQuery('refactor the entire authentication system', [])).toBe('full');
    expect(classifyQuery('implement a new feature', [])).toBe('full');
  });

  it('classifies short messages as fast', async () => {
    const { classifyQuery } = await import('./routing.js');
    const cls = classifyQuery('what is 2+2', []);
    expect(cls).toBe('fast');
  });

  it('classifies long messages (>200 chars) as full', async () => {
    const { classifyQuery } = await import('./routing.js');
    const longMsg = 'x'.repeat(201);
    expect(classifyQuery(longMsg, [])).toBe('full');
  });

  it('classifies multi-file keywords as full', async () => {
    const { classifyQuery } = await import('./routing.js');
    expect(classifyQuery('rename across all files', [])).toBe('full');
  });

  it('returns fast or full (valid tiers)', async () => {
    const { classifyQuery } = await import('./routing.js');
    const cls = classifyQuery('what time is it?', []);
    expect(['fast', 'full']).toContain(cls);
  });
});

describe('resolveModel', () => {
  it('returns a non-empty string for fast tier', async () => {
    const { resolveModel } = await import('./routing.js');
    const m = resolveModel('fast', 'auto');
    expect(typeof m).toBe('string');
    expect(m.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for full tier', async () => {
    const { resolveModel } = await import('./routing.js');
    const m = resolveModel('full', 'auto');
    expect(typeof m).toBe('string');
    expect(m.length).toBeGreaterThan(0);
  });

  it('returns explicit model when not auto', async () => {
    const { resolveModel } = await import('./routing.js');
    const m = resolveModel('full', 'accounts/fireworks/models/llama-v3p1-70b-instruct');
    expect(m).toBe('accounts/fireworks/models/llama-v3p1-70b-instruct');
  });

  it('returns auto tier model from env or default', async () => {
    const { resolveModel } = await import('./routing.js');
    const m = resolveModel('auto' as any, 'auto');
    expect(typeof m).toBe('string');
  });
});
