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
import type { FleetAgent, FleetConfig, FleetSubtask } from "./types.js";
import type { UsageTotal } from "../kernel/types.js";
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
export declare function writeFleetState(runId: string, goalSlug: string, config: Pick<FleetConfig, "goal" | "model" | "maxTurns" | "timeoutMs">, agents: FleetAgent[]): Promise<string>;
export declare function readFleetState(path: string): Promise<FleetStateFile>;
export declare function findLatestState(goalSubstring: string): Promise<string | null>;
