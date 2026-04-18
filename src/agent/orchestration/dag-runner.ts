// @ts-nocheck
/**
 * agent/orchestration/dag-runner.ts — Execute DAG with dependency resolution
 * Phase 1: Run tasks respecting dependencies with retry policies
 */

import type { Task, TaskId, TaskDAG, TaskResult, TeamResult, TraceSpan } from './types.js';
import { getReadyTasks, topologicalSort } from './dag.js';
import { runTaskWithRetry } from './retry.js';
import type { AgentPool } from './agent-pool.js';

interface RunOptions {
  parallel: boolean;
  maxConcurrency: number;
  traceHandler?: (span: TraceSpan) => void | Promise<void>;
  onTaskStart?: (taskId: TaskId) => void;
  onTaskComplete?: (result: TaskResult) => void;
  onTaskError?: (taskId: TaskId, error: string) => void;
}

/** Execute a DAG of tasks respecting dependencies */
export async function runDAG(
  dag: TaskDAG,
  pool: AgentPool,
  options: RunOptions
): Promise<TeamResult> {
  const startTime = Date.now();
  const completed = new Set<TaskId>();
  const failed = new Set<TaskId>();
  const results = new Map<TaskId, TaskResult>();
  const executionOrder: TaskId[] = [];
  const errors: Array<{ taskId: TaskId; error: string }> = [];
  
  // Get topological order for sequential execution
  const topoOrder = options.parallel ? null : topologicalSort(dag);
  if (!options.parallel && !topoOrder) {
    return {
      teamId: '',
      success: false,
      results,
      executionOrder: [],
      durationMs: 0,
      errors: [{ taskId: '', error: 'Circular dependency in DAG' }],
    };
  }

  const runId = generateRunId();
  
  // Execute tasks
  if (options.parallel) {
    await executeParallel(dag, pool, options, completed, failed, results, executionOrder, errors, runId);
  } else {
    await executeSequential(dag, pool, options, topoOrder!, completed, failed, results, executionOrder, errors, runId);
  }

  const durationMs = Date.now() - startTime;
  
  return {
    teamId: '',
    success: errors.length === 0 && failed.size === 0,
    results,
    executionOrder,
    durationMs,
    errors,
  };
}

/** Execute tasks in parallel respecting dependencies (event-driven, no polling) */
async function executeParallel(
  dag: TaskDAG,
  pool: AgentPool,
  options: RunOptions,
  completed: Set<TaskId>,
  failed: Set<TaskId>,
  results: Map<TaskId, TaskResult>,
  executionOrder: TaskId[],
  errors: Array<{ taskId: TaskId; error: string }>,
  runId: string
): Promise<void> {
  const running = new Map<TaskId, Promise<void>>();
  const queued = new Set<TaskId>();
  const total = dag.tasks.size;

  const tryDispatch = (): void => {
    const ready = getReadyTasks(dag, completed).filter(t => {
      if (queued.has(t.id)) return false;
      // Cascade failure: skip tasks whose dependencies failed
      if (t.dependsOn.some(dep => failed.has(dep))) {
        failed.add(t.id);
        errors.push({ taskId: t.id, error: 'Dependency failed (cascade)' });
        results.set(t.id, { taskId: t.id, success: false, error: 'Dependency failed', retries: 0, durationMs: 0 });
        executionOrder.push(t.id);
        return false;
      }
      return true;
    });

    for (const task of ready) {
      queued.add(task.id);
      options.onTaskStart?.(task.id);
      const p = executeTask(task, pool, options, runId).then(result => {
        running.delete(task.id);
        results.set(task.id, result);
        executionOrder.push(task.id);
        if (result.success) {
          completed.add(task.id);
          options.onTaskComplete?.(result);
        } else {
          failed.add(task.id);
          errors.push({ taskId: task.id, error: result.error || 'Unknown error' });
          options.onTaskError?.(task.id, result.error || 'Unknown error');
        }
        tryDispatch(); // unblock dependents
      });
      running.set(task.id, p);
    }
  };

  tryDispatch();

  // Drain: wait until all tasks are accounted for
  while (completed.size + failed.size < total) {
    if (running.size === 0) break; // nothing left to wait on (remaining blocked by failures)
    await Promise.race(running.values());
  }
}

/** Execute tasks sequentially in topological order */
async function executeSequential(
  dag: TaskDAG,
  pool: AgentPool,
  options: RunOptions,
  order: TaskId[],
  completed: Set<TaskId>,
  failed: Set<TaskId>,
  results: Map<TaskId, TaskResult>,
  executionOrder: TaskId[],
  errors: Array<{ taskId: TaskId; error: string }>,
  runId: string
): Promise<void> {
  for (const taskId of order) {
    const task = dag.tasks.get(taskId);
    if (!task) continue;
    
    // Check if any dependency failed
    const hasFailedDep = task.dependsOn.some(depId => failed.has(depId));
    if (hasFailedDep) {
      failed.add(taskId);
      errors.push({ taskId, error: 'Dependency failed' });
      continue;
    }
    
    options.onTaskStart?.(taskId);
    
    const result = await executeTask(task, pool, options, runId);
    
    if (result.success) {
      completed.add(taskId);
    } else {
      failed.add(taskId);
      errors.push({ taskId, error: result.error || 'Unknown error' });
    }
    
    results.set(taskId, result);
    executionOrder.push(taskId);
    options.onTaskComplete?.(result);
  }
}

/** Execute a single task with retry logic */
async function executeTask(
  task: Task,
  pool: AgentPool,
  options: RunOptions,
  runId: string
): Promise<TaskResult> {
  const startTime = Date.now();
  
  // Acquire agent from pool
  const agent = await pool.acquire(task.agentId);
  if (!agent) {
    return {
      taskId: task.id,
      success: false,
      error: 'No agent available',
      retries: 0,
      durationMs: 0,
    };
  }
  
  try {
    const result = await runTaskWithRetry(
      task,
      agent,
      {
        maxRetries: task.maxRetries,
        retryDelayMs: task.retryDelayMs,
        retryBackoff: task.retryBackoff,
      },
      options.traceHandler,
      runId
    );
    
    return {
      ...result,
      durationMs: Date.now() - startTime,
    };
  } finally {
    pool.release(agent.id);
  }
}

/** Check if task has any dependent in the failed set */
function hasDependentInPath(
  dag: TaskDAG,
  taskId: TaskId,
  failed: Set<TaskId>
): boolean {
  // Check if any failed task depends on this task
  for (const [id, task] of dag.tasks) {
    if (failed.has(id) && task.dependsOn.includes(taskId)) {
      return true;
    }
  }
  return false;
}

/** Generate unique run ID */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
