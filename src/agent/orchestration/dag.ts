/**
 * agent/orchestration/dag.ts — DAG operations and validation
 * Phase 1: Directed Acyclic Graph for task dependencies
 */

import type { Task, TaskId, TaskDAG } from './types.js';

/** Create a new empty DAG */
export function createDAG(): TaskDAG {
  return {
    tasks: new Map(),
    roots: [],
    leaves: [],
  };
}

/** Add a task to the DAG */
export function addTask(dag: TaskDAG, task: Task): void {
  dag.tasks.set(task.id, task);
  updateRootsAndLeaves(dag);
}

/** Remove a task and update dependencies */
export function removeTask(dag: TaskDAG, taskId: TaskId): boolean {
  if (!dag.tasks.has(taskId)) return false;
  
  dag.tasks.delete(taskId);
  
  // Remove this task from other tasks' dependencies
  for (const task of dag.tasks.values()) {
    task.dependsOn = task.dependsOn.filter(id => id !== taskId);
  }
  
  updateRootsAndLeaves(dag);
  return true;
}

/** Add dependency between two tasks */
export function addDependency(
  dag: TaskDAG, 
  from: TaskId, 
  to: TaskId
): { success: boolean; error?: string } {
  const fromTask = dag.tasks.get(from);
  const toTask = dag.tasks.get(to);
  
  if (!fromTask) return { success: false, error: `Task ${from} not found` };
  if (!toTask) return { success: false, error: `Task ${to} not found` };
  if (from === to) return { success: false, error: 'Cannot depend on self' };
  
  // Check for circular dependency
  if (wouldCreateCycle(dag, from, to)) {
    return { success: false, error: 'Would create circular dependency' };
  }
  
  if (!toTask.dependsOn.includes(from)) {
    toTask.dependsOn.push(from);
  }
  
  updateRootsAndLeaves(dag);
  return { success: true };
}

/** Check if adding edge would create cycle */
export function wouldCreateCycle(
  dag: TaskDAG, 
  from: TaskId, 
  to: TaskId
): boolean {
  // If 'to' can reach 'from', adding from->to creates cycle
  return canReach(dag, to, from);
}

/** DFS to check if start can reach target */
export function canReach(dag: TaskDAG, start: TaskId, target: TaskId): boolean {
  const visited = new Set<TaskId>();
  const stack = [start];
  
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    
    const task = dag.tasks.get(current);
    if (task) {
      // Find tasks that depend on current (reverse edge traversal)
      for (const [id, t] of dag.tasks) {
        if (t.dependsOn.includes(current)) {
          stack.push(id);
        }
      }
    }
  }
  return false;
}

/** Get tasks that are ready to execute (all deps completed) */
export function getReadyTasks(dag: TaskDAG, completed: Set<TaskId>): Task[] {
  const ready: Task[] = [];
  
  for (const task of dag.tasks.values()) {
    if (task.status !== 'pending') continue;
    
    const allDepsCompleted = task.dependsOn.every(id => completed.has(id));
    if (allDepsCompleted) {
      ready.push(task);
    }
  }
  
  return ready;
}

/** Get execution order using topological sort */
export function topologicalSort(dag: TaskDAG): TaskId[] | null {
  const inDegree = new Map<TaskId, number>();
  const adjacency = new Map<TaskId, TaskId[]>();
  
  // Initialize
  for (const [id, task] of dag.tasks) {
    inDegree.set(id, task.dependsOn.length);
    adjacency.set(id, []);
  }
  
  // Build reverse adjacency (task -> dependents)
  for (const [id, task] of dag.tasks) {
    for (const depId of task.dependsOn) {
      adjacency.get(depId)?.push(id);
    }
  }
  
  // Kahn's algorithm
  const queue: TaskId[] = [];
  const result: TaskId[] = [];
  
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    
    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  // Check for cycle
  if (result.length !== dag.tasks.size) {
    return null; // Cycle detected
  }
  
  return result;
}

/** Validate DAG integrity */
export function validateDAG(dag: TaskDAG): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check all dependencies exist
  for (const [id, task] of dag.tasks) {
    for (const depId of task.dependsOn) {
      if (!dag.tasks.has(depId)) {
        errors.push(`Task ${id} depends on non-existent task ${depId}`);
      }
    }
  }
  
  // Check for cycles
  const sortResult = topologicalSort(dag);
  if (sortResult === null) {
    errors.push('Circular dependency detected');
  }
  
  return { valid: errors.length === 0, errors };
}

/** Update root and leaf task lists */
function updateRootsAndLeaves(dag: TaskDAG): void {
  dag.roots = [];
  dag.leaves = [];
  
  const hasDependents = new Set<TaskId>();
  
  for (const [id, task] of dag.tasks) {
    if (task.dependsOn.length === 0) {
      dag.roots.push(id);
    }
    for (const depId of task.dependsOn) {
      hasDependents.add(depId);
    }
  }
  
  for (const id of dag.tasks.keys()) {
    if (!hasDependents.has(id)) {
      dag.leaves.push(id);
    }
  }
}

/** Get all ancestors of a task */
export function getAncestors(dag: TaskDAG, taskId: TaskId): TaskId[] {
  const ancestors: TaskId[] = [];
  const visited = new Set<TaskId>();
  const stack: TaskId[] = [taskId];
  
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    
    const task = dag.tasks.get(current);
    if (task) {
      for (const depId of task.dependsOn) {
        if (depId !== taskId) {
          ancestors.push(depId);
          stack.push(depId);
        }
      }
    }
  }
  
  return ancestors;
}

/** Get all descendants of a task */
export function getDescendants(dag: TaskDAG, taskId: TaskId): TaskId[] {
  const descendants: TaskId[] = [];
  const visited = new Set<TaskId>();
  const queue: TaskId[] = [taskId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Find tasks that depend on current
    for (const [id, task] of dag.tasks) {
      if (task.dependsOn.includes(current) && !visited.has(id)) {
        visited.add(id);
        if (id !== taskId) {
          descendants.push(id);
          queue.push(id);
        }
      }
    }
  }
  
  return descendants;
}
