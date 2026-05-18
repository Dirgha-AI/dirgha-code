/**
 * orchestra/core/types.ts — Types for the dirgha orchestra multi-agent system.
 *
 * An "orchestration" is a named collection of N agent subprocesses managed
 * by the dirgha CLI itself. Each agent runs in its own subprocess
 * (child_process.spawn), its stdout/stderr is piped into an Ink TUI pane.
 * The parent process is the multiplexer — no tmux, no external window mgr.
 */
export interface AgentSlot {
    /** Short unique id ("agent-1" or short uuid). */
    id: string;
    /** Human-readable label shown in the TUI pane border. */
    label: string;
    /** The task/prompt this agent was given. */
    task: string;
    /** Agent adapter kind. */
    adapter: "dirgha" | "claude" | "codex" | "generic";
    /** Child process PID (0 if not yet spawned). */
    pid: number;
    /** Current lifecycle status. */
    status: AgentStatus;
    /** Exit code (null while running). */
    exitCode: number | null;
    /** Spawn timestamp (epoch ms). */
    startedAt: number;
    /** Wall time in ms (set on exit). */
    elapsedMs: number | null;
    /** Model name reported by the agent, if known. */
    model?: string;
    /** Cost in USD, if tracked. */
    cost?: number;
    /** Token count, if tracked. */
    tokens?: number;
    /** Last N lines of output (ring buffer for TUI display). */
    outputBuffer: string[];
    /** Whether this agent accepts keyboard input. */
    hasFocus: boolean;
}
export type AgentStatus = "pending" | "spawning" | "running" | "done" | "failed" | "killed";
export interface OrchestraSession {
    /** Short unique id. */
    id: string;
    /** Human title. */
    title: string;
    /** All agent slots in this orchestration. */
    agents: AgentSlot[];
    /** Whether the TUI dashboard is active. */
    active: boolean;
    /** Creation timestamp (epoch ms). */
    createdAt: number;
    /** Last update timestamp (epoch ms). */
    updatedAt: number;
}
export interface LogEntry {
    timestamp: string;
    sessionId: string;
    agentId: string;
    event: "spawn" | "output" | "exit" | "error" | "watcher" | "system";
    payload: Record<string, unknown>;
}
/** Verb for the orchestra subcommand. */
export type OrchestraVerb = "up" | "attach" | "list" | "kill" | "down" | "log" | "web";
