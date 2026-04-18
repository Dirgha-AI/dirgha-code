/**
 * agent/orchestration/task-queue.ts — Event-driven task queue.
 *
 * Pattern from open-multi-agent: tasks track dependency state, emit events
 * when they become ready. DAG runner reacts to events rather than polling.
 */
import { EventEmitter } from 'events';
import type { Task, TaskId, TaskStatus } from './types.js';

export type QueueEvent = 'task:ready' | 'task:started' | 'task:complete' | 'task:failed' | 'queue:done';

export interface QueueProgress {
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  cancelled: number;
}

export class TaskQueue extends EventEmitter {
  private tasks = new Map<TaskId, Task>();

  constructor(tasks: Task[]) {
    super();
    for (const task of tasks) {
      this.tasks.set(task.id, { ...task, status: 'pending' });
    }
  }

  /** Get all tasks currently ready to run (pending + all deps complete). */
  getReady(): Task[] {
    const ready: Task[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'pending') continue;
      const depsOk = (task.dependsOn ?? []).every(dep => this.tasks.get(dep)?.status === 'completed');
      if (depsOk) ready.push(task);
    }
    return ready;
  }

  start(taskId: TaskId): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'running';
    task.startedAt = new Date();
    this.emit('task:started', taskId);
  }

  complete(taskId: TaskId, output?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'completed';
    task.output = output;
    task.completedAt = new Date();
    this.emit('task:complete', taskId);

    // Emit ready for any tasks that were waiting on this one
    for (const ready of this.getReady()) {
      this.emit('task:ready', ready.id);
    }

    if (this.isDone()) this.emit('queue:done');
  }

  fail(taskId: TaskId, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date();
    this.emit('task:failed', taskId);

    // Cascade: cancel all tasks that depend (directly or transitively) on failed one
    this.cascadeCancel(taskId);
    if (this.isDone()) this.emit('queue:done');
  }

  private cascadeCancel(failedId: TaskId): void {
    for (const task of this.tasks.values()) {
      if (task.status !== 'pending') continue;
      if ((task.dependsOn ?? []).includes(failedId)) {
        task.status = 'cancelled';
        this.emit('task:failed', task.id);
        this.cascadeCancel(task.id);
      }
    }
  }

  getTask(taskId: TaskId): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getProgress(): QueueProgress {
    const counts: QueueProgress = { total: this.tasks.size, pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const task of this.tasks.values()) {
      if (task.status === 'pending')   counts.pending++;
      if (task.status === 'running')   counts.running++;
      if (task.status === 'completed') counts.done++;
      if (task.status === 'failed')    counts.failed++;
      if (task.status === 'cancelled') counts.cancelled++;
    }
    return counts;
  }

  isDone(): boolean {
    return Array.from(this.tasks.values()).every(
      t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
    );
  }

  progressLine(): string {
    const p = this.getProgress();
    return `[${p.done}/${p.total} done, ${p.running} running, ${p.failed} failed]`;
  }
}
