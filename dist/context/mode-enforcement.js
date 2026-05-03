/**
 * Mode-based tool gating.
 *
 * The mode preamble in the system prompt tells the model "don't write
 * in plan mode" — but a model that ignores instructions can still fire
 * a destructive tool. Real enforcement happens at the kernel hook
 * layer: `enforceMode(mode)` returns an AgentHooks fragment whose
 * `beforeToolCall` blocks every write when the mode is plan or verify.
 *
 * Compose with user-defined hooks via `composeHooks(...)`. This module
 * also exports the canonical write-tool set so downstream consumers
 * (e.g. the agent itself, audit displays) can reason about it.
 */
/**
 * Tools that mutate the filesystem, run shells, or otherwise produce
 * side effects beyond reading. Names match `tools/index.ts` exactly.
 *
 * `checkpoint` is mutating (save / restore / delete) but harmless to
 * the project tree (only writes inside ~/.dirgha) — we still block it
 * in plan/verify so the user gets a clean read-only run.
 */
export const WRITE_TOOLS = new Set([
    "fs_write",
    "fs_edit",
    "shell",
    "git",
    "checkpoint",
    "cron",
]);
const READ_ONLY_BROWSER_ACTIONS = new Set(["content", "close"]);
export function enforceMode(mode) {
    if (mode === "act" || mode === "yolo")
        return undefined;
    return {
        beforeToolCall: async (call) => {
            if (call.name === "browser") {
                const action = call.input?.action;
                if (!action || !READ_ONLY_BROWSER_ACTIONS.has(action)) {
                    return {
                        block: true,
                        reason: `Mode is ${mode.toUpperCase()} — browser '${action ?? "(no action)"}' is blocked. content and close are allowed (read-only).`,
                    };
                }
                return undefined;
            }
            if (WRITE_TOOLS.has(call.name)) {
                return {
                    block: true,
                    reason: `Mode is ${mode.toUpperCase()} — '${call.name}' is a write tool and is blocked. Switch to ACT mode to execute (slash: /mode act).`,
                };
            }
            return undefined;
        },
    };
}
/**
 * Sequence-compose two AgentHooks objects. Each lifecycle event runs
 * `a` first, then `b`. If `a.beforeTurn` returns 'abort' or
 * `a.beforeToolCall` blocks, `b` is skipped for that event. After-
 * hooks always run both. Either side may be undefined.
 */
export function composeHooks(a, b) {
    if (!a)
        return b;
    if (!b)
        return a;
    const out = {};
    if (a.beforeTurn || b.beforeTurn) {
        out.beforeTurn = async (turnIndex, messages) => {
            if (a.beforeTurn) {
                const r = await a.beforeTurn(turnIndex, messages);
                if (r === "abort")
                    return "abort";
            }
            if (b.beforeTurn)
                return b.beforeTurn(turnIndex, messages);
            return "continue";
        };
    }
    if (a.afterTurn || b.afterTurn) {
        out.afterTurn = async (turnIndex, usage) => {
            if (a.afterTurn)
                await a.afterTurn(turnIndex, usage);
            if (b.afterTurn)
                await b.afterTurn(turnIndex, usage);
        };
    }
    if (a.beforeToolCall || b.beforeToolCall) {
        out.beforeToolCall = async (call) => {
            let current = call;
            if (a.beforeToolCall) {
                const r = await a.beforeToolCall(current);
                if (r && "block" in r && r.block === true)
                    return r;
                // Propagate input replacement so b sees the updated input.
                if (r?.replaceInput !== undefined)
                    current = { ...current, input: r.replaceInput };
            }
            if (b.beforeToolCall)
                return b.beforeToolCall(current);
            return undefined;
        };
    }
    if (a.afterToolCall || b.afterToolCall) {
        out.afterToolCall = async (call, result) => {
            let current = result;
            if (a.afterToolCall)
                current = await a.afterToolCall(call, current);
            if (b.afterToolCall)
                current = await b.afterToolCall(call, current);
            return current;
        };
    }
    return out;
}
//# sourceMappingURL=mode-enforcement.js.map