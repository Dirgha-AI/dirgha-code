/**
 * fleet/runtime.ts — Launch N sub-agents in parallel worktrees.
 *
 * Design: instead of calling spawnAgent() in-process (which shares cwd and
 * state), we spawn `dirgha ask --quiet` subprocesses with each subprocess's
 * cwd set to its worktree. Clean isolation, reuses the existing CLI.
 */
import { spawn } from 'node:child_process';
import { createWorktree, destroyWorktree, getRepoRoot, slug } from './worktree.js';
import type { FleetAgent, FleetLaunchOptions, FleetLaunchResult, FleetSubtask } from './types.js';

function resolveCliBin(): string {
  // Allow override; otherwise use the bin that's currently running us.
  // process.argv[1] is always the absolute path to the invoked CLI script
  // (works correctly across cwd changes, unlike __dirname after bundling).
  return process.env['DIRGHA_CLI_BIN'] ?? process.argv[1]!;
}

/** Run one sub-agent in its own worktree subprocess. Resolves when it exits. */
async function runAgent(
  agent: FleetAgent,
  options: FleetLaunchOptions,
): Promise<void> {
  agent.status = 'running';
  agent.startedAt = Date.now();
  options.onEvent?.(agent);

  const bin = resolveCliBin();
  const args = [
    bin,
    'ask',
    '--quiet',
    '--max-turns', String(options.maxTurns ?? 15),
    '--session', `fleet_${agent.id}_${Date.now()}`,
    '--model', agent.subtask.model ?? options.model ?? 'auto',
    agent.subtask.task,
  ];

  return new Promise<void>((resolve) => {
    const child = spawn('node', args, {
      cwd: agent.worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DIRGHA_FLEET_AGENT: agent.id },
    });
    agent.pid = child.pid;
    options.onEvent?.(agent);

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs ?? 10 * 60 * 1000);

    child.stdout.on('data', (buf: Buffer) => {
      const s = buf.toString('utf8');
      agent.output += s;
      agent.bytesWritten += buf.length;
      if (options.verbose) process.stderr.write(`[${agent.id}] ${s}`);
      options.onEvent?.(agent);
    });

    child.stderr.on('data', (buf: Buffer) => {
      if (options.verbose) process.stderr.write(`[${agent.id}:err] ${buf.toString('utf8')}`);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      agent.completedAt = Date.now();
      if (code === 0) {
        agent.status = 'completed';
      } else if (code === 130 || code === null) {
        agent.status = 'cancelled';
      } else {
        agent.status = 'failed';
        agent.error = `exit ${code}`;
      }
      options.onEvent?.(agent);
      resolve();
    });
  });
}

/** Run agents with a simple semaphore for concurrency control. */
async function runWithConcurrency(
  agents: FleetAgent[],
  options: FleetLaunchOptions,
): Promise<void> {
  const limit = Math.max(1, options.concurrency ?? 3);
  const queue = [...agents];
  const inflight = new Set<Promise<void>>();

  while (queue.length > 0 || inflight.size > 0) {
    while (inflight.size < limit && queue.length > 0) {
      const agent = queue.shift()!;
      const p = runAgent(agent, options).finally(() => inflight.delete(p));
      inflight.add(p);
    }
    if (inflight.size > 0) await Promise.race(inflight);
  }
}

/**
 * Create worktrees, spawn N agents in parallel, return result.
 * Worktrees are kept after completion for user review — destroy via
 * cleanup() when done.
 */
export async function launchFleet(
  goal: string,
  subtasks: FleetSubtask[],
  options: FleetLaunchOptions = {},
): Promise<FleetLaunchResult> {
  const repoRoot = getRepoRoot();
  const goalSlug = slug(goal) || 'fleet';
  const started = Date.now();

  const agents: FleetAgent[] = subtasks.map((s) => {
    const branchName = `fleet/${goalSlug}/${s.id}`;
    const worktreePath = createWorktree(branchName, repoRoot, options.worktreeBase);
    return {
      id: s.id,
      subtask: s,
      status: 'pending',
      worktreePath,
      branchName,
      startedAt: 0,
      output: '',
      bytesWritten: 0,
    };
  });

  // Emit initial pending state for panel
  for (const a of agents) options.onEvent?.(a);

  await runWithConcurrency(agents, options);

  const successCount = agents.filter(a => a.status === 'completed').length;
  const failCount    = agents.filter(a => a.status === 'failed' || a.status === 'cancelled').length;

  return {
    goal,
    agents,
    successCount,
    failCount,
    durationMs: Date.now() - started,
  };
}

/** Tear down worktrees and delete branches. */
export function cleanupFleet(agents: FleetAgent[], force = false): void {
  const repoRoot = getRepoRoot();
  for (const a of agents) {
    destroyWorktree(a.worktreePath, repoRoot, force);
  }
}
