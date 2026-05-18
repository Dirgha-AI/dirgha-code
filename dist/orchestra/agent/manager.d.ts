/**
 * orchestra/agent/manager.ts — Agent subprocess lifecycle manager.
 *
 * Spawns, tracks, and terminates agent child processes. Each agent runs
 * as a forked subprocess (e.g. `dirgha ask <task>`). Output is streamed
 * to the session registry and the NDJSON log. The manager provides a
 * single `SpawnResult` per agent so the caller can await completion or
 * kill on demand.
 *
 * Architecture: agents are "dumb pipes" — stdin/stdout only. The parent
 * (dirgha orchestra) is the multiplexer. No tmux, no side channels.
 */
import { type ChildProcess } from "node:child_process";
import type { AgentSlot, OrchestraSession } from "../core/types.js";
export interface SpawnResult {
    agentId: string;
    process: ChildProcess;
    /** Promise that resolves with exit code when the process ends. */
    done: Promise<number>;
}
export interface SpawnOptions {
    /** The command to run (default: "dirgha"). */
    command?: string;
    /** Args after the command (e.g. ["ask", "refactor auth"]). */
    args?: string[];
    /** Working directory for the subprocess. */
    cwd?: string;
    /** Environment variables. */
    env?: Record<string, string | undefined>;
}
/**
 * Spawn an agent subprocess and wire it into the session registry + log.
 * Returns the agent id and the child process handle.
 */
export declare function spawnAgent(sessionId: string, label: string, task: string, adapter: AgentSlot["adapter"], opts?: SpawnOptions): Promise<SpawnResult | null>;
/**
 * Kill a running agent by session + agent id. Sends SIGTERM, then
 * SIGKILL after 3 seconds.
 */
export declare function killAgent(sessionId: string, agentId: string): Promise<boolean>;
/**
 * Kill all agents in a session and return the updated session.
 */
export declare function killAll(sessionId: string): Promise<OrchestraSession | undefined>;
