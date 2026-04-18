/**
 * evals/harness.test.ts — Unit tests for the eval harness (no live API calls)
 */
import { describe, it, expect } from 'vitest';
import { TASK_SUITE } from './harness.js';

describe('TASK_SUITE', () => {
  it('exports 20 tasks', () => {
    expect(TASK_SUITE).toHaveLength(20);
  });

  it('each task has id, prompt, and expect array', () => {
    for (const task of TASK_SUITE) {
      expect(typeof task.id).toBe('string');
      expect(typeof task.prompt).toBe('string');
      expect(Array.isArray(task.expect)).toBe(true);
    }
  });

  it('all task IDs are unique', () => {
    const ids = TASK_SUITE.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe('runEvals structure', () => {
  it('can be imported', async () => {
    const mod = await import('./harness.js');
    expect(mod.runEvals).toBeDefined();
  });
});
