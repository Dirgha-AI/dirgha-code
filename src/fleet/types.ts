/**
 * fleet/types.ts — Types for parallel-agent Fleet runtime.
 *
 * Terminology (industry-standard via multi-agent workspace research):
 *   - worktree — filesystem isolation (git worktree)
 *   - fleet    — a set of parallel agents working on one goal
 *   - subtask  — one independent stream within a fleet
 *   - campaign — a resumable fleet (survives crashes)
 */

export type FleetAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AgentType = 'explore' | 'plan' | 'verify' | 'code' | 'research' | 'custom';

export interface FleetSubtask {
  /** Short identifier, also used as branch suffix (e.g., "auth-middleware") */
  id: string;
  /** Human-readable description */
  title: string;
  /** The task prompt sent to the sub-agent */
  task: string;
  /** Agent type, determines tool allowlist */
  type?: AgentType;
  /** Optional model override */
  model?: string;
}

export interface FleetAgent {
  id: string;
  subtask: FleetSubtask;
  status: FleetAgentStatus;
  worktreePath: string;
  branchName: string;
  startedAt: number;
  completedAt?: number;
  output: string;
  error?: string;
  /** Number of lines/chars written; used by panel for activity indicator */
  bytesWritten: number;
  pid?: number;
}

export interface FleetLaunchOptions {
  /** Max concurrent agents (default 3) */
  concurrency?: number;
  /** Base directory for worktrees (default .fleet) */
  worktreeBase?: string;
  /** Model to use for all agents (default: inherited) */
  model?: string;
  /** Max turns per agent (default 15) */
  maxTurns?: number;
  /** Timeout per agent in ms (default 10 min) */
  timeoutMs?: number;
  /** Called when any agent's state changes — used by TUI FleetPanel */
  onEvent?: (agent: FleetAgent) => void;
  /** Verbose agent output streams to stderr (default false) */
  verbose?: boolean;
}

export interface FleetLaunchResult {
  goal: string;
  agents: FleetAgent[];
  successCount: number;
  failCount: number;
  durationMs: number;
}
