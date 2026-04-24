import { describe, it, expect } from 'vitest';
import { getMemory } from './unified-memory.js';

describe('UnifiedMemory stub', () => {
  it('returns a singleton', () => {
    const a = getMemory();
    const b = getMemory();
    expect(a).toBe(b);
  });

  it('search returns an array (not a Promise)', () => {
    const mem = getMemory();
    const result = mem.search('anything');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('search accepts a second options argument without throwing', () => {
    const mem = getMemory();
    expect(() => mem.search('q', { tags: ['a'], limit: 5 })).not.toThrow();
  });

  it('recall returns an array (not a Promise)', () => {
    const mem = getMemory();
    const result = mem.recall();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('recall accepts options and still returns an array', () => {
    const mem = getMemory();
    const result = mem.recall({ layer: 'hot', limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('store resolves without throwing', async () => {
    const mem = getMemory();
    await expect(mem.store('key', { v: 1 })).resolves.toBeUndefined();
  });

  it('retrieve resolves to null for unknown keys', async () => {
    const mem = getMemory();
    const result = await mem.retrieve('missing-key');
    expect(result).toBeNull();
  });

  it('getContext resolves to an empty array', async () => {
    const mem = getMemory();
    const ctx = await mem.getContext();
    expect(Array.isArray(ctx)).toBe(true);
  });

  it('startSession returns an id and tracks it', () => {
    const mem = getMemory();
    const { id } = mem.startSession('project-1', 'desc');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^session-/);
    expect(mem.getCurrentSessionId()).toBe(id);
    expect(mem.getCurrentProjectId()).toBe('project-1');
  });

  it('endSession clears tracked session and project', () => {
    const mem = getMemory();
    mem.startSession('p', 'd');
    mem.endSession();
    expect(mem.getCurrentSessionId()).toBeNull();
    expect(mem.getCurrentProjectId()).toBeNull();
  });

  it('getSessionContext returns an array', () => {
    const mem = getMemory();
    const ctx = mem.getSessionContext();
    expect(Array.isArray(ctx)).toBe(true);
  });

  it('resumeSession sets the session id', () => {
    const mem = getMemory();
    mem.resumeSession('abc-123');
    expect(mem.getCurrentSessionId()).toBe('abc-123');
  });

  // Regression guard: the S1.4 recall-crash fix normalized Promise returns
  // to arrays at the caller. These tests lock in that search/recall are
  // sync and return arrays, so a future async re-introduction is caught.
  it('regression: search is not async (would break recall command)', () => {
    const mem = getMemory();
    const result: any = mem.search('q');
    expect(typeof result.then).toBe('undefined');
  });

  it('regression: recall is not async (would break recall command)', () => {
    const mem = getMemory();
    const result: any = mem.recall();
    expect(typeof result.then).toBe('undefined');
  });

  it('search with undefined options works', () => {
    const mem = getMemory();
    expect(() => mem.search('q', undefined as any)).not.toThrow();
  });

  it('recall with empty options works', () => {
    const mem = getMemory();
    expect(() => mem.recall({})).not.toThrow();
  });

  it('multiple start/end cycles leave state clean', () => {
    const mem = getMemory();
    for (let i = 0; i < 3; i++) {
      const { id } = mem.startSession(`p-${i}`);
      expect(mem.getCurrentSessionId()).toBe(id);
      mem.endSession();
      expect(mem.getCurrentSessionId()).toBeNull();
    }
  });

  it('session ids are unique across starts', async () => {
    const mem = getMemory();
    const a = mem.startSession('x').id;
    // startSession uses Date.now; a short await between calls guarantees distinct ms.
    await new Promise(r => setTimeout(r, 2));
    const b = mem.startSession('y').id;
    expect(a).not.toBe(b);
  });

  it('store accepts any value shape', async () => {
    const mem = getMemory();
    await expect(mem.store('k', null)).resolves.toBeUndefined();
    await expect(mem.store('k', 'string')).resolves.toBeUndefined();
    await expect(mem.store('k', [1, 2, 3])).resolves.toBeUndefined();
    await expect(mem.store('k', { deep: { nested: true } })).resolves.toBeUndefined();
  });

  it('recall options include valid tier names', () => {
    const mem = getMemory();
    // These tier names are the ones the CLI passes; the stub ignores them
    // but must not throw.
    expect(() => mem.recall({ includeTiers: ['hot', 'warm', 'cold'] })).not.toThrow();
  });

  it('search with empty string is well-defined (returns array)', () => {
    const mem = getMemory();
    const result = mem.search('');
    expect(Array.isArray(result)).toBe(true);
  });

  it('retrieve with empty key is well-defined', async () => {
    const mem = getMemory();
    const result = await mem.retrieve('');
    expect(result).toBeNull();
  });
});
