/**
 * TaskQueue — Non-blocking prompt queue for Dirgha CLI
 * 
 * Non-blocking: you can type and submit new prompts while tools are running.
 * New prompts are queued and processed after the current task finishes.
 */

export interface QueuedTask {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  priority: number; // Higher = sooner
  abortController?: AbortController;
  error?: string;
  metadata?: Record<string, any>;
}

export class TaskQueue {
  private queue: QueuedTask[] = [];
  private running = false;
  private currentTask: QueuedTask | null = null;
  private onUpdate: (tasks: QueuedTask[], current: QueuedTask | null) => void;
  private processFn: (task: QueuedTask) => Promise<void>;

  constructor(
    processFn: (task: QueuedTask) => Promise<void>,
    onUpdate: (tasks: QueuedTask[], current: QueuedTask | null) => void
  ) {
    this.processFn = processFn;
    this.onUpdate = onUpdate;
  }

  /**
   * Add a new task to the queue
   * Returns immediately - doesn't wait for processing
   */
  enqueue(prompt: string, options: { priority?: number; metadata?: Record<string, any> } = {}): QueuedTask {
    const task: QueuedTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      prompt: prompt.slice(0, 500),
      status: 'pending',
      submittedAt: Date.now(),
      priority: options.priority ?? 0,
      metadata: options.metadata,
    };

    // Special case: high priority tasks go to front (but after currently running)
    const insertIdx = this.queue.findIndex(t => t.status === 'pending' && t.priority < task.priority);
    if (insertIdx === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIdx, 0, task);
    }

    this.notify();

    // Auto-start if not already running
    if (!this.running) {
      this.processNext();
    }

    return task;
  }

  /**
   * Cancel a pending or running task
   */
  cancel(taskId: string): boolean {
    const task = this.queue.find(t => t.id === taskId);
    if (!task) return false;

    if (task.status === 'running') {
      task.abortController?.abort();
      task.status = 'cancelled';
      task.completedAt = Date.now();
    } else if (task.status === 'pending') {
      task.status = 'cancelled';
      task.completedAt = Date.now();
    } else {
      return false;
    }

    this.notify();
    return true;
  }

  /**
   * Cancel all pending tasks and abort current
   */
  cancelAll(): number {
    let count = 0;
    if (this.currentTask && this.currentTask.status === 'running') {
      this.currentTask.abortController?.abort();
      this.currentTask.status = 'cancelled';
      this.currentTask.completedAt = Date.now();
      count++;
    }

    for (const task of this.queue) {
      if (task.status === 'pending') {
        task.status = 'cancelled';
        task.completedAt = Date.now();
        count++;
      }
    }
    this.notify();
    return count;
  }

  /**
   * Abort current task but keep queue
   */
  async skipCurrent(): Promise<void> {
    if (this.currentTask && this.currentTask.status === 'running') {
      this.currentTask.abortController?.abort();
      this.currentTask.status = 'cancelled';
      this.currentTask.completedAt = Date.now();
      this.notify();
    }
  }

  /**
   * Get current queue status
   */
  getStatus(): {
    pending: number;
    running: boolean;
    current: QueuedTask | null;
    completed: number;
    total: number;
  } {
    return {
      pending: this.queue.filter(t => t.status === 'pending').length,
      running: this.running,
      current: this.currentTask,
      completed: this.queue.filter(t => t.status === 'completed' || t.status === 'failed').length,
      total: this.queue.length,
    };
  }

  /**
   * Get all tasks (for display)
   */
  getTasks(): QueuedTask[] {
    return [...this.queue];
  }

  /**
   * Clear completed/cancelled tasks from history
   */
  clearHistory(): void {
    this.queue = this.queue.filter(t => t.status === 'pending' || t.status === 'running');
    this.notify();
  }

  private async processNext(): Promise<void> {
    if (this.running) return;

    // Find next pending task with highest priority
    const next = this.queue.find(t => t.status === 'pending');
    if (!next) {
      this.running = false;
      this.currentTask = null;
      this.notify();
      return;
    }

    this.running = true;
    next.status = 'running';
    next.startedAt = Date.now();
    next.abortController = new AbortController();
    this.currentTask = next;
    this.notify();

    try {
      await this.processFn(next);
      if (next.status === 'running') {
        next.status = 'completed';
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        next.status = 'cancelled';
      } else {
        next.status = 'failed';
        next.error = err.message;
      }
    } finally {
      next.completedAt = Date.now();
      this.running = false;
      this.currentTask = null;
      this.notify();
      
      // Zero-delay next task
      setImmediate(() => this.processNext());
    }
  }

  private notify(): void {
    this.onUpdate(this.getTasks(), this.currentTask);
  }
}

// Singleton instance for the CLI
let globalQueue: TaskQueue | null = null;

export function initTaskQueue(
  processFn: (task: QueuedTask) => Promise<void>,
  onUpdate: (tasks: QueuedTask[], current: QueuedTask | null) => void
): TaskQueue {
  globalQueue = new TaskQueue(processFn, onUpdate);
  return globalQueue;
}

export function getTaskQueue(): TaskQueue | null {
  return globalQueue;
}
