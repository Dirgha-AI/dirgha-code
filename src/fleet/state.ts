/**
 * fleet/state.ts — Checkpoint/resume for fleet runs.
 *
 * State file: ~/.dirgha/fleet-state/<goalSlug>-<runId>.json
 * Written fire-and-forget after each agent turn and status transition.
 * Used by `dirgha fleet resume` to restart incomplete agents.
 *
 * Known limitation: all agents share a single JSON state file which causes
 * write amplification (N agents × T turns = N×T rewrites of the full file).
 * Consider per-agent files or an append-only log as the agent count grows.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FleetAgent, FleetConfig, FleetSubtask } from "./types.js";
import type { UsageTotal } from "../kernel/types.js";

const STATE_DIR = join(homedir(), ".dirgha", "fleet-state");

// Serialize concurrent writes to the same file path (multiple agents fire
// turn_end simultaneously and all call writeFleetState with the same runId).
const writeQueues = new Map<string, Promise<void>>();

export interface FleetAgentState {
  id: string;
  subtask: FleetSubtask;
  status: FleetAgent["status"];
  worktreePath: string;
  branchName: string;
  startedAt: number;
  completedAt?: number;
  output: string;
  error?: string;
  usage: UsageTotal;
  turnCount: number;
  sessionId?: string;
}

export interface FleetStateFile {
  version: 1;
  runId: string;
  goalSlug: string;
  goal: string;
  model: string;
  maxTurns: number;
  timeoutMs: number;
  writtenAt: string;
  agents: FleetAgentState[];
}

export async function writeFleetState(
  runId: string,
  goalSlug: string,
  config: Pick<FleetConfig, "goal" | "model" | "maxTurns" | "timeoutMs">,
  agents: FleetAgent[],
): Promise<string> {
  await mkdir(STATE_DIR, { recursive: true });
  const filePath = join(STATE_DIR, `${goalSlug}-${runId}.json`);

  const prev = writeQueues.get(filePath) ?? Promise.resolve();
  const next = prev.then(async () => {
    const state: FleetStateFile = {
      version: 1,
      runId,
      goalSlug,
      goal: config.goal,
      model: config.model ?? "",
      maxTurns: config.maxTurns ?? 15,
      timeoutMs: config.timeoutMs ?? 600_000,
      writtenAt: new Date().toISOString(),
      agents: agents.map(agentToState),
    };
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  });
  // Store a non-rejecting tail so the queue is never poisoned by a write error.
  writeQueues.set(
    filePath,
    next.catch(() => {}),
  );
  await next;
  return filePath;
}

export async function readFleetState(path: string): Promise<FleetStateFile> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as FleetStateFile;
  if (parsed.version !== 1)
    throw new Error(`Unsupported fleet state version: ${parsed.version}`);
  return parsed;
}

export async function findLatestState(
  goalSubstring: string,
): Promise<string | null> {
  const { readdir } = await import("node:fs/promises");
  let files: string[];
  try {
    files = await readdir(STATE_DIR);
  } catch {
    return null;
  }
  const jsonFiles = files
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  for (const f of jsonFiles) {
    try {
      const st = await readFleetState(join(STATE_DIR, f));
      if (st.goal.toLowerCase().includes(goalSubstring.toLowerCase())) {
        return join(STATE_DIR, f);
      }
    } catch {
      /* corrupt state file — skip */
    }
  }
  return null;
}

function agentToState(a: FleetAgent): FleetAgentState {
  return {
    id: a.id,
    subtask: a.subtask,
    status: a.status,
    worktreePath: a.worktreePath,
    branchName: a.branchName,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    output: a.output,
    error: a.error,
    usage: a.usage,
    turnCount: 0,
    sessionId: a.sessionId,
  };
}
