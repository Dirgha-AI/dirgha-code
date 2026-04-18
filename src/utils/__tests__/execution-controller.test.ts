import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExecutionController } from '../execution-controller.js';

describe('ExecutionController', () => {
  let controller: ExecutionController;

  beforeEach(() => {
    controller = new ExecutionController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute simple command successfully', async () => {
    const result = await controller.execute('echo', ['hello']);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
    expect(result.strategy).toBe('direct');
  });

  it('should handle command failure', async () => {
    const result = await controller.execute('false', []);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.strategy).toBe('failed');
  });

  it('should timeout long-running commands', async () => {
    const result = await controller.execute('sleep', ['5'], {
      timeout: 100,
      retries: 0,
    });

    expect(result.success).toBe(false);
    expect(result.killed).toBe(true);
    expect(result.exitCode).toBe(124);
  });

  it('should emit attempt events', async () => {
    const attempts: number[] = [];
    controller.on('attempt', ({ attempt }) => attempts.push(attempt));

    await controller.execute('echo', ['test']);

    expect(attempts).toContain(1);
  });

  it('should retry on failure', async () => {
    const retries: number[] = [];
    controller.on('retry', ({ attempt }) => retries.push(attempt));

    await controller.execute('false', [], { retries: 2 });

    expect(retries.length).toBeGreaterThan(0);
  });

  it('should use fallback commands', async () => {
    const result = await controller.execute('nonexistent-command', [], {
      retries: 0,
      fallback: ['echo', 'fallback-worked'],
    });

    expect(result.success).toBe(true);
    expect(result.strategy).toBe('fallback');
    expect(result.stdout).toContain('fallback-worked');
  });

  it('should emit progress for large outputs', async () => {
    const progressEvents: { bytes: number; lines: number }[] = [];
    controller.on('progress', (p) => progressEvents.push(p));

    await controller.execute('seq', ['1', '1000']);

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0]).toHaveProperty('bytes');
    expect(progressEvents[0]).toHaveProperty('lines');
  });

  it('should truncate large outputs', async () => {
    const result = await controller.execute('seq', ['1', '10000'], {
      maxOutputBytes: 1000,
    });

    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1000);
  });
});
