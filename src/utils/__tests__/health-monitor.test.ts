import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessHealthMonitor } from '../health-monitor.js';

describe('ProcessHealthMonitor', () => {
  let monitor: ProcessHealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new ProcessHealthMonitor({
      checkInterval: 1000,
      stuckThreshold: 5000,
    });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should start with healthy status', () => {
    monitor.start();
    const health = monitor.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should detect stuck process', () => {
    const stuckHandler = vi.fn();
    monitor.on('stuck', stuckHandler);

    monitor.start();

    // Simulate time passing without output
    vi.advanceTimersByTime(6000);

    expect(stuckHandler).toHaveBeenCalled();
    expect(monitor.isStuck()).toBe(true);
  });

  it('should update status on output', () => {
    monitor.start();

    // Initially healthy
    expect(monitor.getHealth().status).toBe('healthy');

    // Simulate output
    monitor.outputReceived(100, 5);

    const health = monitor.getHealth();
    expect(health.progress.bytes).toBe(100);
    expect(health.progress.lines).toBe(5);
  });

  it('should emit health check events', () => {
    const healthCheckHandler = vi.fn();
    monitor.on('healthCheck', healthCheckHandler);

    monitor.start();
    vi.advanceTimersByTime(1000);

    expect(healthCheckHandler).toHaveBeenCalled();
  });

  it('should stop monitoring', () => {
    const stopHandler = vi.fn();
    monitor.on('stopped', stopHandler);

    monitor.start();
    monitor.stop();

    expect(stopHandler).toHaveBeenCalled();
    expect(monitor.getHealth().status).toBe('healthy');
  });

  it('should track memory usage', () => {
    monitor.start();
    monitor.heartbeat();

    const health = monitor.getHealth();
    expect(health.memoryUsage).toBeGreaterThanOrEqual(0);
  });
});
