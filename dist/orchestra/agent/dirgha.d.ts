/**
 * orchestra/agent/dirgha.ts — Dirgha adapter.
 *
 * Spawns `dirgha ask --no-interactive <task>` as an agent subprocess.
 */
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
export declare function spawnDirghaAgent(sessionId: string, label: string, task: string, opts?: DirghaAgentOptions): Promise<import("./manager.js").SpawnResult | null>;
/**
 * Spawn N dirgha agents in a session, one per task.
 * Returns an array of spawn results.
 */
export declare function spawnDirghaFleet(sessionId: string, tasks: string[], opts?: DirghaAgentOptions): Promise<(import("./manager.js").SpawnResult | null)[]>;
