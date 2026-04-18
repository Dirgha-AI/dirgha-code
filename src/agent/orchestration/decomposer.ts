/**
 * agent/orchestration/decomposer.ts — Backward-compatibility re-export layer.
 *
 * Canonical decomposition now lives in coordinator.ts.
 * This file re-exports decomposeGoal from there and retains the team-registry
 * helpers consumed by repl/slash/team.ts.
 */

// Canonical decomposition lives in coordinator.ts.
// Re-exported here for backward compatibility.
export { decomposeGoal } from './coordinator.js';
export type { OrchestrateResult } from './coordinator.js';

import type { DecompositionResult, Team } from './types.js';
export type { Team } from './types.js';

/** Validate decomposition result */
export function validateDecomposition(
  result: DecompositionResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const taskIds = new Set(result.tasks.map(t => t.id));

  for (const task of result.tasks) {
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
      }
    }
  }

  const visited = new Set<string>();

  function hasCycle(taskId: string, path: Set<string>): boolean {
    if (path.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    path.add(taskId);
    const task = result.tasks.find(t => t.id === taskId);
    if (task) {
      for (const depId of task.dependsOn) {
        if (hasCycle(depId, path)) return true;
      }
    }
    path.delete(taskId);
    return false;
  }

  for (const task of result.tasks) {
    if (hasCycle(task.id, new Set())) {
      errors.push('Circular dependency detected');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Team registry helpers (used by repl/slash/team.ts) ─────────────────────

const globalRegistry = new Map<string, Team>();

export function getGlobalRegistry(): Map<string, Team> {
  return globalRegistry;
}

export function createTeam(opts: Pick<Team, 'id' | 'name' | 'agents'> & Partial<Team>): Team {
  const team: Team = {
    sharedMemory: false,
    maxParallel: 5,
    ...opts,
  };
  globalRegistry.set(team.id, team);
  return team;
}

export function removeTeam(id: string): boolean {
  return globalRegistry.delete(id);
}
