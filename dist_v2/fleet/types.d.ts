/**
 * fleet/types.ts — Shared types for parallel-agent Fleet runtime (v2).
 *
 * A Fleet is a bounded set of parallel subagents, each running the v2
 * agent-loop inside its own isolated git worktree. The parent observes
 * all of them through a single EventStream and receives a FleetResult
 * summarising every agent's outcome.
 *
 * Vocabulary (carried over from v1):
 *   - worktree  — filesystem isolation (git worktree)
 *   - fleet     — a set of parallel agents pursuing one goal
 *   - subtask   — one independent stream inside a fleet
 *   - shot      — a single stylistic variant in a tripleshot
 */
import type { AgentEvent, UsageTotal, Message, StopReason } from '../kernel/types.js';
import type { EventStream } from '../kernel/event-stream.js';
export type FleetAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentType = 'explore' | 'plan' | 'verify' | 'code' | 'research' | 'custom';
export type TripleVariant = 'conservative' | 'balanced' | 'bold';
/** A task the fleet should run in one worktree. */
export interface FleetSubtask {
    /** Short kebab-case identifier; also used as branch suffix. */
    id: string;
    /** Human-readable title, shown in progress output. */
    title: string;
    /** Prompt sent to the agent. Must be self-contained. */
    task: string;
    /** Agent type — determines tool allowlist. Default: 'code'. */
    type?: AgentType;
    /** Per-subtask model override. Default: fleet-level `model`. */
    model?: string;
    /** Explicit tool allowlist. Default: derived from `type`. */
    toolAllowlist?: string[];
}
/** Live state of a single fleet agent. */
export interface FleetAgent {
    id: string;
    subtask: FleetSubtask;
    status: FleetAgentStatus;
    worktreePath: string;
    branchName: string;
    startedAt: number;
    completedAt?: number;
    /** Captured assistant text output. */
    output: string;
    /** Final error message when status = 'failed'/'cancelled'. */
    error?: string;
    /** Bytes of assistant text written (drives activity indicators). */
    bytesWritten: number;
    /** Cumulative token usage for this agent. */
    usage: UsageTotal;
    /** Stop reason from the agent loop. */
    stopReason?: StopReason;
    /** Child session id assigned by the agent loop. */
    sessionId?: string;
    /** Full transcript (only populated after completion). */
    transcript?: Message[];
    /** Number of tool calls the agent successfully executed during the run.
     * 0 = agent never invoked a tool — usually means it hallucinated
     * completion via text rather than doing the work. */
    toolExecCount?: number;
}
/** Handle to a git worktree created by the fleet. */
export interface WorktreeHandle {
    /** Absolute path to the worktree root. */
    path: string;
    /** Branch name created for the worktree. */
    branch: string;
    /** Absolute path to the repository that owns the worktree. */
    repoRoot: string;
    /** HEAD commit at the time of creation. */
    baseCommit: string;
}
/** Configuration for a fleet launch. */
export interface FleetConfig {
    /** Goal to work on. */
    goal: string;
    /** Explicit subtasks. If omitted, runFleet() will decompose `goal`. */
    subtasks?: FleetSubtask[];
    /** Max concurrent agents (default 3). */
    concurrency?: number;
    /** Model id used by each agent. Default: `DIRGHA_MODEL` env. */
    model?: string;
    /** Model id used for decomposition + judge. Default: same as `model`. */
    plannerModel?: string;
    /** Max turns per agent (default 15). */
    maxTurns?: number;
    /** Timeout per agent in ms (default 10 min). */
    timeoutMs?: number;
    /** cwd of the parent invocation — used to locate the repo root. */
    cwd?: string;
    /** Subdirectory name under repoRoot for worktrees (default `.fleet`). */
    worktreeBase?: string;
    /** Shared event stream. Fleet events and per-agent events are emitted here. */
    events?: EventStream;
    /** If true, destroy worktrees once the fleet exits. Default: false. */
    autoCleanup?: boolean;
    /** AbortSignal to cancel the fleet. */
    signal?: AbortSignal;
    /** Verbose: mirror child agent text to stderr. */
    verbose?: boolean;
    /** Optional per-subtask progress hook. */
    onAgent?: (agent: FleetAgent) => void;
}
/** Result of a fleet run. */
export interface FleetResult {
    goal: string;
    agents: FleetAgent[];
    worktrees: WorktreeHandle[];
    successCount: number;
    failCount: number;
    durationMs: number;
    totalTokens: UsageTotal;
    failed: FleetAgent[];
}
/** Apply-back strategy. */
export type ApplyStrategy = 
/** Commit in the worktree, generate diff vs parent HEAD, apply 3-way to parent as unstaged. */
'3way'
/** Fast-forward merge parent branch → worktree branch (only if no divergence). */
 | 'merge'
/** Cherry-pick every commit from worktree onto parent HEAD. */
 | 'cherry-pick';
/** Options for applyBack(). */
export interface ApplyOptions {
    strategy?: ApplyStrategy;
    /** Commit message used for the transient commit inside the worktree. */
    message?: string;
    /** Restrict apply to these paths (relative to repo root). */
    paths?: string[];
    /** Repo root. Default: auto-detected from worktree. */
    repoRoot?: string;
}
/** Result of an applyBack() call. */
export interface ApplyResult {
    success: boolean;
    strategy: ApplyStrategy;
    appliedFiles: string[];
    conflicts: string[];
    error?: string;
}
/** A single tripleshot variant. */
export interface TripleshotShot {
    variant: TripleVariant;
    agent: FleetAgent;
    diff: string;
}
/** Result of runTripleshot(). */
export interface TripleshotResult {
    goal: string;
    winner: TripleVariant | null;
    runnerUp: TripleVariant | null;
    reason: string;
    shots: TripleshotShot[];
    agents: FleetAgent[];
    worktrees: WorktreeHandle[];
    /** Set when --auto-merge is used. */
    apply?: ApplyResult;
    totalTokens: UsageTotal;
    durationMs: number;
}
/**
 * Fleet-level events forwarded into the parent EventStream.
 * These ride alongside normal AgentEvents so the parent UI can correlate.
 */
export type FleetEvent = {
    type: 'fleet_start';
    goal: string;
    agents: FleetAgent[];
} | {
    type: 'fleet_agent_start';
    agentId: string;
    subtask: FleetSubtask;
    worktreePath: string;
    branch: string;
} | {
    type: 'fleet_agent_progress';
    agentId: string;
    status: FleetAgentStatus;
    bytes: number;
} | {
    type: 'fleet_agent_end';
    agentId: string;
    status: FleetAgentStatus;
    error?: string;
    usage: UsageTotal;
} | {
    type: 'fleet_end';
    goal: string;
    successCount: number;
    failCount: number;
    durationMs: number;
};
/** Helper type — union of AgentEvent and FleetEvent. */
export type FleetOrAgentEvent = AgentEvent | FleetEvent;
/** Default tool allowlists by AgentType. */
export declare const AGENT_TYPE_TOOLS: Record<AgentType, string[]>;
