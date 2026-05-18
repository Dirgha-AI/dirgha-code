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
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { registry } from "../core/registry.js";
import { writeLog } from "../orchestration/log.js";
/**
 * Spawn an agent subprocess and wire it into the session registry + log.
 * Returns the agent id and the child process handle.
 */
export async function spawnAgent(sessionId, label, task, adapter, opts = {}) {
    const session = registry.get(sessionId);
    if (!session)
        return null;
    const agentId = `agent-${session.agents.length + 1}-${randomUUID().slice(0, 4)}`;
    const now = Date.now();
    const slot = {
        id: agentId,
        label,
        task,
        adapter,
        pid: 0,
        status: "spawning",
        exitCode: null,
        startedAt: now,
        elapsedMs: null,
        outputBuffer: [],
        hasFocus: false,
    };
    registry.addAgent(sessionId, slot);
    writeLog(sessionId, agentId, "spawn", { task, adapter, label });
    const command = opts.command ?? "dirgha";
    const args = opts.args ?? ["ask", "--no-interactive", task];
    let child;
    try {
        child = spawn(command, args, {
            cwd: opts.cwd,
            env: { ...process.env, ...opts.env },
            stdio: ["pipe", "pipe", "pipe"],
        });
    }
    catch (err) {
        registry.updateAgent(sessionId, agentId, {
            status: "failed",
            exitCode: -1,
            elapsedMs: Date.now() - now,
        });
        writeLog(sessionId, agentId, "error", {
            message: err.message,
        });
        return null;
    }
    registry.updateAgent(sessionId, agentId, {
        pid: child.pid ?? 0,
        status: "running",
    });
    // Wire stdout: each line → registry buffer + log.
    child.stdout?.on("data", (chunk) => {
        const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
        for (const line of lines) {
            registry.appendOutput(sessionId, agentId, line);
            writeLog(sessionId, agentId, "output", { line });
        }
    });
    // Wire stderr similarly.
    child.stderr?.on("data", (chunk) => {
        const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
        for (const line of lines) {
            registry.appendOutput(sessionId, agentId, `[stderr] ${line}`);
            writeLog(sessionId, agentId, "output", { line, stream: "stderr" });
        }
    });
    // Wait for exit.
    const done = new Promise((resolve) => {
        child.on("exit", (code) => {
            const elapsed = Date.now() - now;
            registry.updateAgent(sessionId, agentId, {
                status: code === 0 ? "done" : "failed",
                exitCode: code ?? -1,
                elapsedMs: elapsed,
            });
            writeLog(sessionId, agentId, "exit", { code, elapsedMs: elapsed });
            resolve(code ?? -1);
        });
        child.on("error", (err) => {
            registry.updateAgent(sessionId, agentId, {
                status: "failed",
                exitCode: -2,
            });
            writeLog(sessionId, agentId, "error", { message: err.message });
            resolve(-2);
        });
    });
    return { agentId, process: child, done };
}
/**
 * Kill a running agent by session + agent id. Sends SIGTERM, then
 * SIGKILL after 3 seconds.
 */
export async function killAgent(sessionId, agentId) {
    const agent = registry.getAgent(sessionId, agentId);
    if (!agent || (agent.status !== "running" && agent.status !== "spawning")) {
        return false;
    }
    // Find the child process and kill it.
    try {
        process.kill(agent.pid, "SIGTERM");
        // Give it 3 seconds then SIGKILL.
        setTimeout(() => {
            try {
                process.kill(agent.pid, "SIGKILL");
            }
            catch {
                // Already dead.
            }
        }, 3000);
    }
    catch {
        // Process may already be dead.
    }
    registry.updateAgent(sessionId, agentId, { status: "killed" });
    writeLog(sessionId, agentId, "exit", { code: -1, killed: true });
    return true;
}
/**
 * Kill all agents in a session and return the updated session.
 */
export async function killAll(sessionId) {
    const session = registry.get(sessionId);
    if (!session)
        return undefined;
    const kills = session.agents
        .filter((a) => a.status === "running" || a.status === "spawning")
        .map((a) => killAgent(sessionId, a.id));
    await Promise.all(kills);
    registry.update(sessionId, { active: false });
    return registry.get(sessionId);
}
//# sourceMappingURL=manager.js.map