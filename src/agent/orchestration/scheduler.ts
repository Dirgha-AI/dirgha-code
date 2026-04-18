/**
 * agent/orchestration/scheduler.ts — Task scheduling strategies.
 *
 * 4 strategies from open-multi-agent:
 *   1. round-robin       — even distribution across agents
 *   2. least-busy        — pick agent with fewest active tasks
 *   3. capability-match  — keyword overlap between task desc + agent specialty
 *   4. dependency-first  — prioritize tasks with most downstream dependents
 */
import type { Task, TaskId } from './types.js';

export type SchedulingStrategy = 'round-robin' | 'least-busy' | 'capability-match' | 'dependency-first';

export interface AgentSlot {
  id: string;
  specialty?: string;    // e.g. "code", "research", "explore"
  activeTasks: number;
}

/** Return index into `agents` for this task. */
export type Scheduler = (task: Task, agents: AgentSlot[], allTasks: Task[]) => number;

// ── Round-Robin ────────────────────────────────────────────────────────────

let rrCursor = 0;
function roundRobin(_task: Task, agents: AgentSlot[]): number {
  const idx = rrCursor % agents.length;
  rrCursor++;
  return idx;
}

// ── Least-Busy ─────────────────────────────────────────────────────────────

function leastBusy(_task: Task, agents: AgentSlot[]): number {
  let minLoad = Infinity;
  let chosen = 0;
  for (let i = 0; i < agents.length; i++) {
    if (agents[i]!.activeTasks < minLoad) {
      minLoad = agents[i]!.activeTasks;
      chosen = i;
    }
  }
  return chosen;
}

// ── Capability-Match ───────────────────────────────────────────────────────

function keywordScore(text: string, specialty: string): number {
  const words = specialty.toLowerCase().split(/\W+/);
  const lower = text.toLowerCase();
  return words.filter(w => w.length > 2 && lower.includes(w)).length;
}

function capabilityMatch(task: Task, agents: AgentSlot[]): number {
  const taskText = `${task.name} ${task.description}`;
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < agents.length; i++) {
    const score = keywordScore(taskText, agents[i]?.specialty ?? '');
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best >= 0 ? best : leastBusy(task, agents);
}

// ── Dependency-First ───────────────────────────────────────────────────────

/** Count how many tasks (transitively) depend on `taskId`. */
function countDownstream(taskId: TaskId, allTasks: Task[]): number {
  const direct = allTasks.filter(t => (t.dependsOn ?? []).includes(taskId));
  return direct.reduce((acc, t) => acc + 1 + countDownstream(t.id, allTasks), 0);
}

function dependencyFirst(task: Task, agents: AgentSlot[], allTasks: Task[]): number {
  // This strategy affects ORDERING, not agent assignment; fall back to least-busy for assignment
  void countDownstream(task.id, allTasks); // used by caller to sort ready queue
  return leastBusy(task, agents);
}

// ── Factory ────────────────────────────────────────────────────────────────

export function getScheduler(strategy: SchedulingStrategy): Scheduler {
  switch (strategy) {
    case 'round-robin':      return roundRobin;
    case 'least-busy':       return leastBusy;
    case 'capability-match': return capabilityMatch;
    case 'dependency-first': return dependencyFirst;
  }
}

/**
 * Sort ready tasks by downstream dependency count (dependency-first).
 * Tasks that unblock more work go first.
 */
export function sortByPriority(tasks: Task[], allTasks: Task[]): Task[] {
  return [...tasks].sort((a, b) =>
    countDownstream(b.id, allTasks) - countDownstream(a.id, allTasks)
  );
}
