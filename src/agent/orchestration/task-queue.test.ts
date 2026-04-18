/**
 * agent/orchestration/task-queue.test.ts — TaskQueue event + cascade cancel tests
 */
import { describe, it, expect, vi } from 'vitest';
import { TaskQueue } from './task-queue.js';
import type { Task } from './types.js';

function makeTask(id: string, deps: string[] = [], overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    description: `Description for ${id}`,
    prompt: `Do task ${id}`,
    dependsOn: deps,
    status: 'pending',
    maxRetries: 1,
    retryCount: 0,
    retryDelayMs: 0,
    retryBackoff: 'fixed',
    ...overrides,
  };
}

describe('TaskQueue.getReady', () => {
  it('returns tasks with no dependencies immediately', () => {
    const q = new TaskQueue([makeTask('A'), makeTask('B', ['A']), makeTask('C')]);
    const ready = q.getReady().map(t => t.id);
    expect(ready).toContain('A');
    expect(ready).toContain('C');
    expect(ready).not.toContain('B');
  });

  it('makes dependent task ready once dep completes', () => {
    const q = new TaskQueue([makeTask('X'), makeTask('Y', ['X'])]);
    expect(q.getReady().map(t => t.id)).not.toContain('Y');
    q.complete('X', 'done');
    expect(q.getReady().map(t => t.id)).toContain('Y');
  });
});

describe('TaskQueue events', () => {
  it('emits task:ready for root tasks on construction via getReady()', () => {
    const q = new TaskQueue([makeTask('Root'), makeTask('Child', ['Root'])]);
    const ready = q.getReady();
    expect(ready.find(t => t.id === 'Root')).toBeDefined();
  });

  it('emits task:complete after complete()', () => {
    const q = new TaskQueue([makeTask('T1')]);
    const completed: string[] = [];
    q.on('task:complete', (id: string) => completed.push(id));
    q.complete('T1', 'output');
    expect(completed).toContain('T1');
  });

  it('emits task:failed after fail()', () => {
    const q = new TaskQueue([makeTask('F1')]);
    const failed: string[] = [];
    q.on('task:failed', (id: string) => failed.push(id));
    q.fail('F1', 'exploded');
    expect(failed).toContain('F1');
  });

  it('emits queue:done when all tasks are resolved', () => {
    const q = new TaskQueue([makeTask('Solo')]);
    let done = false;
    q.on('queue:done', () => { done = true; });
    q.complete('Solo', 'finished');
    expect(done).toBe(true);
  });
});

describe('TaskQueue cascade cancel', () => {
  it('cancels dependents when parent fails', () => {
    const q = new TaskQueue([makeTask('P'), makeTask('Q', ['P']), makeTask('R', ['Q'])]);
    q.fail('P', 'error');
    expect(q.getTask('Q')?.status).toBe('cancelled');
    expect(q.getTask('R')?.status).toBe('cancelled');
  });

  it('does not cancel unrelated tasks', () => {
    const q = new TaskQueue([makeTask('P'), makeTask('Q', ['P']), makeTask('Unrelated')]);
    q.fail('P', 'oops');
    expect(q.getTask('Unrelated')?.status).toBe('pending');
  });
});

describe('TaskQueue.getProgress', () => {
  it('tracks counts correctly', () => {
    const q = new TaskQueue([makeTask('A'), makeTask('B'), makeTask('C', ['A'])]);
    const p0 = q.getProgress();
    expect(p0.total).toBe(3);
    expect(p0.pending).toBe(3);

    q.complete('A', 'ok');
    const p1 = q.getProgress();
    expect(p1.done).toBe(1);

    q.fail('B', 'err');
    const p2 = q.getProgress();
    expect(p2.failed).toBe(1);
    // C depends on A (completed), not B — so C is still pending/ready, not cancelled
    expect(p2.cancelled).toBe(0);
  });
});
