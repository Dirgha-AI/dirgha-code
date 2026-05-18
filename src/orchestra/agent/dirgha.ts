/**
 * orchestra/agent/dirgha.ts — Dirgha adapter.
 *
 * Spawns `dirgha ask --no-interactive <task>` as an agent subprocess.
 */

import { spawnAgent, type SpawnOptions } from "./manager.js";

export interface DirghaAgentOptions {
  /** Extra args passed to dirgha, e.g. ["--model", "deepseek"]. */
  extraArgs?: string[];
  /** Working directory. */
  cwd?: string;
}

/**
 * Spawn a dirgha agent subprocess for a given task.
 * Returns the agent id and child process handle via spawnAgent.
 */
export async function spawnDirghaAgent(
  sessionId: string,
  label: string,
  task: string,
  opts: DirghaAgentOptions = {},
) {
  const args: string[] = ["ask", "--no-interactive"];
  if (opts.extraArgs) args.push(...opts.extraArgs);
  args.push(task);

  const spawnOpts: SpawnOptions = {
    command: "dirgha",
    args,
    cwd: opts.cwd,
  };

  return spawnAgent(sessionId, label, task, "dirgha", spawnOpts);
}

/**
 * Spawn N dirgha agents in a session, one per task.
 * Returns an array of spawn results.
 */
export async function spawnDirghaFleet(
  sessionId: string,
  tasks: string[],
  opts: DirghaAgentOptions = {},
) {
  const results = [];
  for (let i = 0; i < tasks.length; i++) {
    const label = `agent-${i + 1}`;
    const result = await spawnDirghaAgent(sessionId, label, tasks[i]!, opts);
    results.push(result);
  }
  return results;
}
