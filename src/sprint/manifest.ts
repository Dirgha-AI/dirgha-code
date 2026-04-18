import { parse } from 'yaml';
import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { SprintManifest, SprintTask, SprintNotifyConfig, SprintEscalationConfig, VerificationCriterion } from './types.js';

export async function parseManifest(filePath: string): Promise<SprintManifest> {
  const content = await fs.readFile(filePath, 'utf-8');
  const raw = parse(content) as any;
  
  if (!raw || typeof raw !== 'object') {
    throw new Error('Manifest must be an object');
  }
  
  // Resolve prompt_file references before building
  if (raw.sprint?.tasks && Array.isArray(raw.sprint.tasks)) {
    const baseDir = dirname(filePath);
    for (const task of raw.sprint.tasks) {
      if (task.prompt_file) {
        if (task.prompt) {
          throw new Error(`Task ${task.id || 'unknown'} has both prompt and prompt_file`);
        }
        const promptPath = resolve(baseDir, task.prompt_file);
        task.prompt = await fs.readFile(promptPath, 'utf-8');
        delete task.prompt_file;
      }
    }
  }
  
  return buildManifestFromObject(raw);
}

export function buildManifestFromObject(raw: unknown): SprintManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Manifest must be an object');
  }
  
  const rawObj = raw as Record<string, any>;
  if (!rawObj.sprint) {
    throw new Error('Missing required field: sprint');
  }
  
  const s = rawObj.sprint;
  
  // Validate required sprint fields
  const requiredFields = ['id', 'goal', 'created', 'model', 'cwd'];
  for (const field of requiredFields) {
    if (s[field] === undefined || s[field] === null || s[field] === '') {
      throw new Error(`Missing required field: sprint.${field}`);
    }
  }
  
  // Get default retries from escalation config
  const defaultMaxRetries = s.escalation?.max_retries_default;
  
  const manifest: SprintManifest = {
    id: s.id,
    goal: s.goal,
    created: s.created,
    model: s.model,
    cwd: s.cwd,
    maxDurationHours: s.max_duration_hours,
    maxParallel: s.max_parallel,
    notify: mapNotify(s.notify),
    escalation: mapEscalation(s.escalation),
    tasks: mapTasks(s.tasks, defaultMaxRetries)
  };
  
  validateManifest(manifest);
  return manifest;
}

function mapNotify(n: any): SprintNotifyConfig {
  if (!n || typeof n !== 'object') {
    return { whatsapp: false, onComplete: true, onBlocked: true, onTaskDone: false };
  }
  return {
    whatsapp: n.whatsapp,
    onComplete: n.on_complete,
    onBlocked: n.on_blocked,
    onTaskDone: n.on_task_done
  };
}

function mapEscalation(e: any): SprintEscalationConfig {
  if (!e || typeof e !== 'object') {
    return { onRepeatedFailure: 'pause', maxRetriesDefault: 2, costThresholdUsd: 50, timeMultiplier: 3 };
  }
  return {
    onRepeatedFailure: e.on_repeated_failure,
    maxRetriesDefault: e.max_retries_default,
    costThresholdUsd: e.cost_threshold_usd,
    timeMultiplier: e.time_multiplier
  };
}

function mapTasks(tasks: any[], defaultMaxRetries?: number): SprintTask[] {
  if (!Array.isArray(tasks)) {
    return [];
  }
  
  return tasks.map((t, index) => {
    if (!t.id) {
      throw new Error(`Task at index ${index} missing required field: id`);
    }
    
    return {
      id: t.id,
      title: t.title,
      prompt: t.prompt,
      dependsOn: t.depends_on || [],
      estimatedMinutes: t.estimated_minutes,
      onFail: t.on_fail,
      maxRetries: t.max_retries ?? defaultMaxRetries ?? 2,
      verification: mapVerification(t.verification)
    };
  });
}

function mapVerification(v: any[]): VerificationCriterion[] {
  if (!Array.isArray(v)) {
    return [];
  }
  
  return v.map((step, index) => {
    if (!step.type) {
      throw new Error(`Verification step at index ${index} missing required field: type`);
    }
    return {
      type: step.type,
      path: step.path,
      command: step.command,
      expectExit: step.expect_exit,
      timeoutSeconds: step.timeout_seconds
    };
  });
}

export function validateManifest(manifest: SprintManifest): void {
  if (!manifest.tasks || manifest.tasks.length === 0) {
    throw new Error('Manifest must have at least one task');
  }
  
  // Check for duplicate task IDs
  const taskIds = new Set<string>();
  for (const task of manifest.tasks) {
    if (taskIds.has(task.id)) {
      throw new Error(`Duplicate task ID: ${task.id}`);
    }
    taskIds.add(task.id);
  }
  
  // Validate depends_on references exist
  for (const task of manifest.tasks) {
    if (task.dependsOn && Array.isArray(task.dependsOn)) {
      for (const depId of task.dependsOn) {
        if (!taskIds.has(depId)) {
          throw new Error(`Task ${task.id} depends on non-existent task: ${depId}`);
        }
      }
    }
  }
  
  // Check for circular dependencies
  const cycles = detectCircularDeps(manifest.tasks);
  if (cycles.length > 0) {
    throw new Error(`Circular dependencies detected: ${cycles.join('; ')}`);
  }
}

export function detectCircularDeps(tasks: SprintTask[]): string[] {
  const graph = new Map<string, string[]>();
  const taskIds = new Set(tasks.map(t => t.id));
  
  // Build adjacency list
  for (const task of tasks) {
    const validDeps = (task.dependsOn || []).filter(id => taskIds.has(id));
    graph.set(task.id, validDeps);
  }
  
  const cycles: string[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);
    
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, path);
      } else if (recStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart).concat([neighbor]);
        cycles.push(cyclePath.join(' -> '));
      }
    }
    
    path.pop();
    recStack.delete(node);
  }
  
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, []);
    }
  }
  
  return cycles;
}
