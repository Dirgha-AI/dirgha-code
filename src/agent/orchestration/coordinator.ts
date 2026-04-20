/**
 * agent/orchestration/coordinator.ts — LLM-driven task decomposition.
 *
 * Given a high-level goal, uses the LLM to produce a structured task list
 * with dependencies, assignees, and descriptions. The output is validated
 * and drives the DAG runner.
 *
 * Inspired by open-multi-agent coordinator pattern.
 */
import { runAgentLoop } from '../loop.js';
import { extractJSON, parseJSON } from '../structured-output.js';
import { TaskQueue } from './task-queue.js';
import { sortByPriority, getScheduler, type SchedulingStrategy, type AgentSlot } from './scheduler.js';
import { spawnAgent, type AgentType } from '../spawn-agent.js';
import type { Task, TaskId } from './types.js';

const COORDINATOR_SYSTEM = `You are a task coordinator. Your job is to break down a complex goal into specific, executable tasks for specialized AI agents.

Available agent types:
- explore: Read-only file search and codebase analysis
- plan:    Analysis, planning, and web research
- verify:  Read files + run bash commands (verification/testing)
- code:    Read, write, and edit files + bash (implementation)
- research: Web search, browser, and file reading

Output ONLY valid JSON (no prose, no code fences) in this exact format:
{
  "tasks": [
    {
      "id": "t1",
      "name": "Short title",
      "description": "Detailed description of what the agent should do",
      "assignee": "explore|plan|verify|code|research",
      "dependsOn": [],
      "priority": "high|medium|low"
    }
  ],
  "complexity": "low|medium|high"
}

Rules:
- Create 2-8 tasks (no more)
- Each task should be completable by one agent in one call
- Dependencies must be task IDs that appear earlier in the list
- Prefer parallel execution (few dependencies)`;

interface CoordinatorOutput {
  tasks: Array<{
    id: string;
    name: string;
    description: string;
    assignee: string;
    dependsOn: string[];
    priority?: string;
  }>;
  complexity?: string;
}

function buildTask(raw: CoordinatorOutput['tasks'][0]): Task {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    prompt: raw.description,
    agentId: raw.assignee,
    dependsOn: raw.dependsOn ?? [],
    status: 'pending',
    maxRetries: 1,
    retryCount: 0,
    retryDelayMs: 1000,
    retryBackoff: 'fixed',
    metadata: { priority: raw.priority ?? 'medium' },
  };
}

export async function decomposeGoal(
  goal: string,
  model: string,
  onText?: (t: string) => void,
): Promise<Task[]> {
  let accumulated = '';
  await runAgentLoop(
    `${COORDINATOR_SYSTEM}\n\nGoal: ${goal}`,
    [],
    model,
    (t) => { accumulated += t; onText?.(t); },
    () => {},
  );

  const json = extractJSON(accumulated);
  const parsed = parseJSON<CoordinatorOutput>(json);

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error('Coordinator returned no tasks');
  }

  return parsed.tasks.map(buildTask);
}

export interface OrchestrateResult {
  tasks: Task[];
  outputs: Record<TaskId, string>;
  failed: TaskId[];
  durationMs: number;
}

/**
 * Full orchestration pipeline:
 *   1. Decompose goal into tasks (LLM)
 *   2. Sort by priority (dependency-first)
 *   3. Execute tasks in parallel respecting deps (spawn_agent per task)
 *   4. Return all outputs
 */
export async function orchestrate(
  goal: string,
  model: string,
  strategy: SchedulingStrategy = 'dependency-first',
  onProgress?: (line: string) => void,
): Promise<OrchestrateResult> {
  const start = Date.now();
  onProgress?.(`  Decomposing goal…`);

  const tasks = await decomposeGoal(goal, model, undefined);
  const sorted = sortByPriority(tasks, tasks);
  const queue = new TaskQueue(sorted);
  const scheduler = getScheduler(strategy);
  const outputs: Record<TaskId, string> = {};
  const failed: TaskId[] = [];

  onProgress?.(`  ${tasks.length} tasks planned [${tasks.map(t => t.agentId ?? '?').join(', ')}]`);

  // Single virtual agent slot (spawn_agent handles its own concurrency)
  const agentSlots: AgentSlot[] = [{ id: 'pool', activeTasks: 0 }];

  return new Promise<OrchestrateResult>((resolve) => {
    const runTask = async (task: Task) => {
      queue.start(task.id);
      agentSlots[0]!.activeTasks++;
      onProgress?.(`  ▶ ${task.name} [${task.agentId ?? 'code'}]`);

      const depContext = (task.dependsOn ?? [])
        .map(id => outputs[id])
        .filter(Boolean)
        .join('\n\n---\n\n');
      const taskPrompt = [
        task.description,
        depContext ? `\n\nContext from previous steps:\n${depContext}` : '',
      ].join('').trim();

      try {
        const agentType: AgentType = (['explore', 'plan', 'verify', 'code', 'research', 'custom'] as AgentType[]).includes(task.agentId as AgentType)
          ? (task.agentId as AgentType)
          : 'code';
        const result = await spawnAgent(
          { type: agentType, task: taskPrompt, model },
          model,
        );
        const output = result.result ?? '';
        outputs[task.id] = output;
        queue.complete(task.id, output);
        onProgress?.(`  ✓ ${task.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push(task.id);
        queue.fail(task.id, msg);
        onProgress?.(`  ✗ ${task.name}: ${msg.slice(0, 60)}`);
      } finally {
        agentSlots[0]!.activeTasks--;
      }
    };

    // Bug 1 fix: register queue:done listener BEFORE dispatching any tasks so
    // that fast/synchronous completions don't fire the event before we listen.
    queue.on('queue:done', () => {
      resolve({
        tasks: queue.getAllTasks(),
        outputs,
        failed,
        durationMs: Date.now() - start,
      });
    });

    // React to completed tasks → dispatch newly ready successors.
    // Bug 4 fix: guard against tasks already transitioned out of 'pending'
    // (e.g. started by a concurrent runTask call or cascade-cancelled).
    queue.on('task:complete', () => {
      for (const task of sortByPriority(queue.getReady(), tasks)) {
        const status = queue.getTask(task.id)?.status;
        if (status !== 'running' && status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
          runTask(task);
        }
      }
    });

    // Kick off initial ready tasks
    const initialReady = queue.getReady();
    for (const task of sortByPriority(initialReady, tasks)) {
      runTask(task);
    }
  });
}
