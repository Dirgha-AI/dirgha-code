import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SprintManifest, TaskStateRow, SprintTask } from './types.js';


export interface EscalationCheck {
  shouldEscalate: boolean;
  reason: string;
  trigger: string;
}

export function checkEscalation(
  manifest: SprintManifest,
  allStates: TaskStateRow[],
  sprintStartedAt: string,
  totalCostUsd: number
): EscalationCheck {
  const now = Date.now();
  const sprintStartTime = new Date(sprintStartedAt).getTime();
  const tasks = manifest.tasks || [];
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  
  // 1. Time overrun: any running task has been running > estimatedMinutes * timeMultiplier minutes
  const timeMultiplier = manifest.escalation?.timeMultiplier ?? 2;
  for (const state of allStates) {
    if (state.status === 'running' && state.startedAt) {
      const runningMs = getRunningDurationMs(state);
      const task = taskMap.get(state.taskId);
      const estimatedMinutes = task?.estimatedMinutes || 0;
      const thresholdMs = estimatedMinutes * 60 * 1000 * timeMultiplier;
      
      if (runningMs > thresholdMs && estimatedMinutes > 0) {
        return {
          shouldEscalate: true,
          reason: `Task ${state.taskId} has been running for ${Math.round(runningMs / 60000)} minutes, exceeding estimated ${estimatedMinutes} minutes (multiplier: ${timeMultiplier})`,
          trigger: 'time_overrun'
        };
      }
    }
  }

  // 2. Repeated failure: any task has attempts >= maxRetries AND status === 'failed'
  const maxRetries = manifest.escalation?.maxRetriesDefault ?? 3;
  for (const state of allStates) {
    if (state.status === 'failed' && (state.attempts || 0) >= maxRetries) {
      return {
        shouldEscalate: true,
        reason: `Task ${state.taskId} has failed after ${state.attempts} attempts (max retries: ${maxRetries})`,
        trigger: 'repeated_failure'
      };
    }
  }

  // 3. Deadlock: there are pending tasks but none can become ready
  if (tasks.length > 0 && hasDeadlock(allStates, tasks)) {
    return {
      shouldEscalate: true,
      reason: 'Deadlock detected: pending tasks have dependencies that will never complete',
      trigger: 'deadlock'
    };
  }

  // 4. Cost threshold: totalCostUsd > manifest.escalation.costThresholdUsd
  const costThreshold = manifest.escalation?.costThresholdUsd ?? 50;
  if (totalCostUsd > costThreshold) {
    return {
      shouldEscalate: true,
      reason: `Total cost $${totalCostUsd.toFixed(2)} exceeds threshold $${costThreshold}`,
      trigger: 'cost_threshold'
    };
  }

  // 5. Duration: total sprint time > manifest.maxDurationHours * 3600000 ms
  const maxDurationHours = manifest.maxDurationHours || 24;
  const maxDurationMs = maxDurationHours * 3600000;
  const sprintDuration = now - sprintStartTime;
  if (sprintDuration > maxDurationMs) {
    return {
      shouldEscalate: true,
      reason: `Sprint duration ${Math.round(sprintDuration / 3600000)} hours exceeds maximum ${maxDurationHours} hours`,
      trigger: 'max_duration'
    };
  }

  return {
    shouldEscalate: false,
    reason: '',
    trigger: ''
  };
}

export function sendNotification(sprintId: string, reason: string, options?: { whatsapp?: boolean }): void {
  if (options?.whatsapp !== false) {
    try {
      const message = `Sprint ${sprintId} paused: ${reason.slice(0, 200)}`;
      execSync(
        `bash /root/dirgha-ai/scripts/notify-whatsapp.sh "${message.replace(/"/g, '\\"')}"`,
        { timeout: 10000, stdio: 'ignore' }
      );
    } catch {
      // Notification failure must not crash the engine
    }
  }
}

export function hasDeadlock(allStates: TaskStateRow[], tasks: SprintTask[]): boolean {
  const stateMap = new Map(allStates.map(s => [s.taskId, s]));
  
  for (const state of allStates) {
    if (state.status !== 'pending') continue;
    
    const task = tasks.find(t => t.id === state.taskId);
    if (!task || !task.dependsOn || task.dependsOn.length === 0) {
      continue;
    }

    const allDepsBlocked = task.dependsOn.every(depId => {
      const depState = stateMap.get(depId);
      if (!depState) return false;
      return ['failed', 'skipped', 'paused', 'aborted'].includes(depState.status);
    });

    if (allDepsBlocked) {
      return true;
    }
  }

  return false;
}

export function getRunningDurationMs(state: TaskStateRow): number {
  if (!state.startedAt) return 0;
  const started = new Date(state.startedAt).getTime();
  if (isNaN(started)) return 0;
  return Date.now() - started;
}
