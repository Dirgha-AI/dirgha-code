/**
 * orchestra/agent/dirgha.ts — Dirgha adapter.
 *
 * Spawns `dirgha ask --no-interactive <task>` as an agent subprocess.
 */
import { spawnAgent } from "./manager.js";
/**
 * Spawn a dirgha agent subprocess for a given task.
 * Returns the agent id and child process handle via spawnAgent.
 */
export async function spawnDirghaAgent(sessionId, label, task, opts = {}) {
    const args = ["ask", "--no-interactive"];
    if (opts.extraArgs)
        args.push(...opts.extraArgs);
    args.push(task);
    const spawnOpts = {
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
export async function spawnDirghaFleet(sessionId, tasks, opts = {}) {
    const results = [];
    for (let i = 0; i < tasks.length; i++) {
        const label = `agent-${i + 1}`;
        const result = await spawnDirghaAgent(sessionId, label, tasks[i], opts);
        results.push(result);
    }
    return results;
}
//# sourceMappingURL=dirgha.js.map