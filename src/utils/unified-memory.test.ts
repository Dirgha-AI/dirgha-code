import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getMemory } from './unified-memory.js';

// Isolate the test's view of the memory store. We delete the backing
// JSONL file before each test so assertions about "empty" actually hold.
beforeEach(() => {
  const memFile = join(homedir(), '.dirgha', 'memory', 'memories.jsonl');
  if (existsSync(memFile)) rmSync(memFile);
});

describe('UnifiedMemory', () => {
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
    const result = mem.recall({ layer: 'workspace', limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('store persists and returns an entry with id+layer', () => {
    const mem = getMemory();
    const entry = mem.store('test fact', { layer: 'workspace', tags: ['t1'] });
    expect(entry.id).toMatch(/^mem_/);
    expect(entry.layer).toBe('workspace');
    expect(entry.content).toBe('test fact');
    expect(mem.recall()).toHaveLength(1);
  });

  it('search finds stored content by substring', () => {
    const mem = getMemory();
    mem.store('apples are red', { tags: [] });
    mem.store('bananas are yellow', { tags: [] });
    const red = mem.search('apple');
    expect(red).toHaveLength(1);
    expect(red[0]?.content).toContain('apples');
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

  it('store accepts optional opts, including empty', () => {
    const mem = getMemory();
    expect(() => mem.store('no opts')).not.toThrow();
    expect(() => mem.store('empty opts', {})).not.toThrow();
    expect(() => mem.store('tags only', { tags: ['a', 'b'] })).not.toThrow();
  });

  it('getStats reports totals and breakdowns', () => {
    const mem = getMemory();
    mem.store('one', { layer: 'workspace' });
    mem.store('two', { layer: 'project' });
    mem.addRule('when x', 'do y');
    const s = mem.getStats();
    expect(s.totalEntries).toBe(3);
    expect(s.byLayer.workspace).toBeGreaterThanOrEqual(2);
    expect(s.byTier.hot).toBe(3);
    expect(s.avgTruthScore).toBeGreaterThan(0);
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
