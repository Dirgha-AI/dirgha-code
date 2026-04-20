import { QueuedTask, TaskQueueStatus } from './TaskQueueTypes.js';

export class TaskQueue {
  private queue: QueuedTask[] = [];
  private activeCount = 0;
  private maxConcurrency = 3;
  private onUpdate: (tasks: QueuedTask[], current: QueuedTask[]) => void;
  private processFn: (task: QueuedTask) => Promise<void>;

  constructor(
    processFn: (task: QueuedTask) => Promise<void>,
    onUpdate: (tasks: QueuedTask[], current: QueuedTask[]) => void
  ) {
    this.processFn = processFn;
    this.onUpdate = onUpdate;
  }

  enqueue(prompt: string, opts: { priority?: number; dependsOn?: string[]; metadata?: Record<string, any> } = {}): QueuedTask {
    const task: QueuedTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prompt, status: 'pending', submittedAt: Date.now(),
      priority: opts.priority ?? 0, dependsOn: opts.dependsOn,
      metadata: opts.metadata,
    };
    this.queue.push(task);
    this.notify();
    this.processNext();
    return task;
  }

  cancelAll() {
    this.queue.forEach(t => {
      if (t.status === 'running') t.abortController?.abort();
      if (t.status === 'pending' || t.status === 'running') t.status = 'cancelled';
    });
    this.notify();
  }

  getStatus(): TaskQueueStatus {
    const running = this.queue.filter(t => t.status === 'running');
    return {
      pending: this.queue.filter(t => t.status === 'pending').length,
      running: running.length, current: running,
      completed: this.queue.filter(t => t.status === 'completed' || t.status === 'failed').length,
      total: this.queue.length,
    };
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency) return;

    const next = this.queue.find(t => {
      if (t.status !== 'pending') return false;
      if (!t.dependsOn || t.dependsOn.length === 0) return true;
      return t.dependsOn.every(id => {
        const dep = this.queue.find(x => x.id === id);
        return dep?.status === 'completed';
      });
    });

    if (!next) return;

    this.activeCount++;
    next.status = 'running';
    next.startedAt = Date.now();
    next.abortController = new AbortController();
    this.notify();

    try {
      await this.processFn(next);
      next.status = 'completed';
    } catch (err: any) {
      next.status = err.name === 'AbortError' ? 'cancelled' : 'failed';
      next.error = err.message;
    } finally {
      next.completedAt = Date.now();
      this.activeCount--;
      this.notify();
      setImmediate(() => this.processNext());
    }

    // Try to start more tasks if concurrency allows
    if (this.activeCount < this.maxConcurrency) setImmediate(() => this.processNext());
  }

  private notify() {
    this.onUpdate([...this.queue], this.queue.filter(t => t.status === 'running'));
  }
}
