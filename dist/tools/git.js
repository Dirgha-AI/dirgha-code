/**
 * Git introspection tool. Read-mostly: status, diff, log, branch, show.
 * Destructive operations (commit, push, reset) are deliberately out of
 * scope — the agent performs those via the shell tool so the user sees
 * a single "exec this command?" prompt per operation.
 */
import { spawn } from "node:child_process";
import { isValidCwdPath } from "../utils/fs.js";
export const gitTool = {
    name: "git",
    description: "Run read-mostly git operations: status, diff, log, branch, show. Destructive git operations should go through the shell tool.",
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["status", "diff", "log", "branch", "show"] },
            args: { type: "array", items: { type: "string" } },
            cwd: { type: "string" },
        },
        required: ["op"],
    },
    requiresApproval: (raw) => {
        const input = raw;
        return input.op === "diff" || input.op === "show";
    },
    async execute(rawInput, ctx) {
        const input = rawInput;
        const base = commandFor(input.op);
        if (!base) {
            return {
                content: `git: unknown op "${String(input.op)}". Expected one of: status, diff, log, branch, show.`,
                data: { op: input.op, exitCode: 64 },
                isError: true,
            };
        }
        const full = [...base, ...(input.args ?? [])];
        let cwd = ctx.cwd;
        if (input.cwd) {
            const check = isValidCwdPath(ctx.cwd, input.cwd);
            if (!check.valid)
                return { content: check.error, isError: true };
            cwd = check.resolved;
        }
        const result = await run("git", full, cwd, ctx.env, ctx.signal);
        return {
            content: [result.stdout, result.stderr]
                .filter((s) => s && s.length > 0)
                .join("\n"),
            data: { op: input.op, exitCode: result.code },
            isError: result.code !== 0,
        };
    },
};
function commandFor(op) {
    switch (op) {
        case "status":
            return ["status", "--short", "--branch"];
        case "diff":
            return ["diff", "--no-color"];
        case "log":
            return ["log", "--oneline", "-n", "20"];
        case "branch":
            return ["branch", "--list"];
        case "show":
            return ["show", "--no-color"];
        default:
            return null;
    }
}
async function run(command, args, cwd, env, signal) {
    const GIT_TIMEOUT_MS = 60_000;
    return new Promise((resolveAll) => {
        const child = spawn(command, args, {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
        });
        const stdout = [];
        const stderr = [];
        child.stdout.on("data", (buf) => stdout.push(buf));
        child.stderr.on("data", (buf) => stderr.push(buf));
        /** Gracefully terminate: SIGTERM, then SIGKILL after 2 s. */
        const killChild = () => {
            child.kill("SIGTERM");
            setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                }
                catch {
                    /* already gone */
                }
            }, 2_000);
        };
        // If signal is already aborted, kill immediately
        if (signal?.aborted) {
            killChild();
        }
        const onAbort = () => {
            killChild();
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(killChild, GIT_TIMEOUT_MS);
        child.on("error", () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolveAll({ stdout: "", stderr: "", code: -1 });
        });
        // Use 'close' (not 'exit') so stdio pipes finish draining before we
        // read the buffers — large diffs can still be in flight when 'exit' fires.
        child.on("close", (code) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolveAll({
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
                code: code ?? -1,
            });
        });
    });
}
//# sourceMappingURL=git.js.map