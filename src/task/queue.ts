/**
 * Task Queue — Task lifecycle management with state machine
 * States: queued → dispatched → running → completed/failed/cancelled
 */
import type { Message } from "../types.js";

export type TaskStatus =
  | "queued"
  | "dispatched"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  issueId?: string;
  agentId?: string;
  workspaceId: string;
  status: TaskStatus;
  prompt: string;
  model: string;
  sessionId?: string;
  workDir?: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
  sessionContext?: any;
}

export interface TaskQueue {
  enqueue(
    prompt: string,
    model: string,
    options?: {
      workspaceId?: string;
      issueId?: string;
      maxAttempts?: number;
    },
  ): Promise<Task>;

  claimNext(agentId: string): Promise<Task | null>;

  start(taskId: string, sessionId: string, workDir: string): Promise<void>;

  complete(taskId: string, result: string): Promise<void>;

  fail(taskId: string, error: string): Promise<void>;

  cancel(taskId: string): Promise<void>;

  getStatus(taskId: string): Promise<Task | null>;

  listByStatus(status: TaskStatus, workspaceId?: string): Promise<Task[]>;

  listByAgent(agentId: string): Promise<Task[]>;
}

// In-memory implementation (swap for SQLite/PostgreSQL in production)
const taskStore = new Map<string, Task>();
let taskCounter = 0;

export const InMemoryTaskQueue: TaskQueue = {
  async enqueue(prompt, model, options) {
    const task: Task = {
      id: `task-${Date.now()}-${++taskCounter}`,
      workspaceId: options?.workspaceId ?? "default",
      status: "queued",
      prompt,
      model,
      attemptCount: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      createdAt: Date.now(),
      issueId: options?.issueId,
    };
    taskStore.set(task.id, task);
    return task;
  },

  async claimNext(agentId) {
    // Find next queued task
    const tasks = Array.from(taskStore.values())
      .filter((t) => t.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt);

    if (tasks.length === 0) return null;

    const task = tasks[0]!;
    task.status = "dispatched";
    task.agentId = agentId;
    taskStore.set(task.id, task);
    return task;
  },

  async start(taskId, sessionId, workDir) {
    const task = taskStore.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "dispatched") {
      throw new Error(`Task ${taskId} not dispatched (status: ${task.status})`);
    }
    task.status = "running";
    task.sessionId = sessionId;
    task.workDir = workDir;
    task.startedAt = Date.now();
    taskStore.set(taskId, task);
  },

  async complete(taskId, result) {
    const task = taskStore.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.status = "completed";
    task.completedAt = Date.now();
    task.result = result;
    taskStore.set(taskId, task);
  },

  async fail(taskId, error) {
    const task = taskStore.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (task.attemptCount < task.maxAttempts) {
      // Retry: reset to queued
      task.attemptCount++;
      task.status = "queued";
      task.agentId = undefined;
      task.error = error;
      taskStore.set(taskId, task);
    } else {
      task.status = "failed";
      task.completedAt = Date.now();
      task.error = error;
      taskStore.set(taskId, task);
    }
  },

  async cancel(taskId) {
    const task = taskStore.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.status = "cancelled";
    task.completedAt = Date.now();
    taskStore.set(taskId, task);
  },

  async getStatus(taskId) {
    return taskStore.get(taskId) ?? null;
  },

  async listByStatus(status, workspaceId) {
    return Array.from(taskStore.values())
      .filter(
        (t) =>
          t.status === status &&
          (!workspaceId || t.workspaceId === workspaceId),
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  },

  async listByAgent(agentId) {
    return Array.from(taskStore.values())
      .filter((t) => t.agentId === agentId)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
};
