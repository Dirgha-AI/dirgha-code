import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface HealthCheck {
  lastHeartbeat: number;
  lastOutput: number;
  startTime: number;
  memoryUsage: number;
  cpuUsage: number;
  status: 'healthy' | 'warning' | 'critical' | 'stuck' | 'dead';
  progress: {
    bytes: number;
    lines: number;
  };
}

export interface HealthMonitorOptions {
  checkInterval?: number;
  stuckThreshold?: number;
  warningThreshold?: number;
  memoryWarning?: number;
  memoryCritical?: number;
  heartbeatTimeout?: number;
}

export class ProcessHealthMonitor extends EventEmitter {
  private checkInterval: number;
  private stuckThreshold: number;
  private warningThreshold: number;
  private memoryWarning: number;
  private memoryCritical: number;
  private heartbeatTimeout: number;

  private interval: NodeJS.Timeout | null = null;
  private health: HealthCheck;

  constructor(options: HealthMonitorOptions = {}) {
    super();

    this.checkInterval = options.checkInterval ?? 5000;
    this.stuckThreshold = options.stuckThreshold ?? 30000;
    this.warningThreshold = options.warningThreshold ?? 10000;
    this.memoryWarning = options.memoryWarning ?? 200 * 1024 * 1024;
    this.memoryCritical = options.memoryCritical ?? 500 * 1024 * 1024;
    this.heartbeatTimeout = options.heartbeatTimeout ?? 15000;

    this.health = {
      lastHeartbeat: Date.now(),
      lastOutput: Date.now(),
      startTime: Date.now(),
      memoryUsage: 0,
      cpuUsage: 0,
      status: 'healthy',
      progress: { bytes: 0, lines: 0 },
    };
  }

  start(): void {
    if (this.interval) return;

    this.health.startTime = Date.now();
    this.health.lastHeartbeat = Date.now();
    this.health.lastOutput = Date.now();

    this.interval = setInterval(() => this.checkHealth(), this.checkInterval);
    this.emit('started', { timestamp: Date.now() });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.emit('stopped', { timestamp: Date.now() });
  }

  heartbeat(): void {
    this.health.lastHeartbeat = Date.now();
    this.updateMemoryUsage();
  }

  outputReceived(bytes: number, lines: number): void {
    this.health.lastOutput = Date.now();
    this.health.progress.bytes += bytes;
    this.health.progress.lines += lines;
    this.updateMemoryUsage();
  }

  progressUpdate(bytes: number, lines: number): void {
    this.health.progress.bytes = bytes;
    this.health.progress.lines = lines;
  }

  private checkHealth(): void {
    const now = Date.now();
    const timeSinceOutput = now - this.health.lastOutput;
    const timeSinceHeartbeat = now - this.health.lastHeartbeat;
    const runtime = now - this.health.startTime;

    this.updateMemoryUsage();

    let newStatus: HealthCheck['status'] = 'healthy';

    if (timeSinceOutput > this.stuckThreshold) {
      newStatus = 'stuck';
      this.emit('stuck', {
        timeSinceOutput,
        threshold: this.stuckThreshold,
        recommendation: this.getRecoveryRecommendation('stuck'),
        progress: this.health.progress,
      });
    } else if (timeSinceHeartbeat > this.heartbeatTimeout) {
      newStatus = 'dead';
      this.emit('dead', {
        timeSinceHeartbeat,
        recommendation: 'Process appears unresponsive. Kill and restart.',
      });
    } else if (timeSinceOutput > this.warningThreshold) {
      newStatus = 'warning';
      this.emit('warning', {
        timeSinceOutput,
        threshold: this.warningThreshold,
        message: 'No output for extended period',
      });
    }

    if (this.health.memoryUsage > this.memoryCritical) {
      newStatus = 'critical';
      this.emit('critical', {
        memoryUsage: this.health.memoryUsage,
        threshold: this.memoryCritical,
        recommendation: 'Memory critical. Kill process immediately.',
      });
    } else if (this.health.memoryUsage > this.memoryWarning && newStatus === 'healthy') {
      newStatus = 'warning';
      this.emit('memoryWarning', {
        memoryUsage: this.health.memoryUsage,
        threshold: this.memoryWarning,
      });
    }

    if (newStatus !== this.health.status) {
      const oldStatus = this.health.status;
      this.health.status = newStatus;
      this.emit('statusChange', {
        from: oldStatus,
        to: newStatus,
        health: this.getHealth(),
        runtime,
      });
    }

    this.emit('healthCheck', {
      ...this.getHealth(),
      runtime,
      timeSinceOutput,
      timeSinceHeartbeat,
    });
  }

  private updateMemoryUsage(): void {
    if (process.memoryUsage) {
      const usage = process.memoryUsage();
      this.health.memoryUsage = usage.heapUsed + usage.external;
    }
  }

  private getRecoveryRecommendation(status: HealthCheck['status']): string {
    switch (status) {
      case 'stuck':
        return 'Auto-kill and retry with chunked execution or smaller input';
      case 'dead':
        return 'Kill process and restart with fresh state';
      case 'critical':
        return 'Immediate termination required - memory limit exceeded';
      default:
        return 'Monitor and wait';
    }
  }

  getHealth(): HealthCheck {
    return { ...this.health };
  }

  isStuck(): boolean {
    return this.health.status === 'stuck';
  }

  isCritical(): boolean {
    return this.health.status === 'critical' || this.health.status === 'dead';
  }

  getRuntime(): number {
    return Date.now() - this.health.startTime;
  }

  getProgress(): { bytes: number; lines: number } {
    return { ...this.health.progress };
  }
}

export const createHealthMonitor = (options?: HealthMonitorOptions): ProcessHealthMonitor => {
  return new ProcessHealthMonitor(options);
};
