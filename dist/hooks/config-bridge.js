/**
 * Bridges user-defined hooks from `~/.dirgha/config.json` into the
 * `AgentHooks` shape expected by `runAgentLoop`. Each configured hook
 * is a shell command executed at the matching lifecycle event:
 *
 *   before_turn       → AgentHooks.beforeTurn
 *   after_turn        → AgentHooks.afterTurn
 *   before_tool_call  → AgentHooks.beforeToolCall   (block on non-zero exit)
 *   after_tool_call   → AgentHooks.afterToolCall    (rewrite result on non-zero exit)
 *
 * Hooks receive a JSON payload on stdin; their stdout is captured but
 * only used for the after_tool_call rewrite path. Non-zero exit from
 * a `before_*` hook blocks the action with the hook's stdout/stderr
 * as the reason.
 *
 * Matchers: `before_tool_call` / `after_tool_call` accept an optional
 * `matcher` regex applied against the tool name. Hooks without a
 * matcher fire for every call.
 */
import { spawn } from 'node:child_process';
async function runHook(entry, payload, timeoutMs = 10_000) {
    return new Promise(resolve => {
        const child = spawn(entry.command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        let killed = false;
        const t = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, timeoutMs);
        child.stdout.on('data', d => { out += d.toString('utf8'); });
        child.stderr.on('data', d => { err += d.toString('utf8'); });
        child.on('error', () => { });
        // EPIPE on stdin is expected when the hook command doesn't read
        // its input (e.g. `echo … && exit 1`). Listen to handle the error
        // so it doesn't crash the parent.
        child.stdin.on('error', () => { });
        child.on('close', code => {
            clearTimeout(t);
            resolve({ exit: killed ? 124 : (code ?? 1), stdout: out, stderr: err });
        });
        try {
            child.stdin.write(JSON.stringify(payload));
            child.stdin.end();
        }
        catch { /* swallow */ }
    });
}
function matches(entry, name) {
    if (!entry.matcher)
        return true;
    try {
        return new RegExp(entry.matcher).test(name);
    }
    catch {
        return false;
    }
}
export function buildAgentHooksFromConfig(config) {
    const cfg = config.hooks;
    if (!cfg)
        return undefined;
    const hasBeforeTurn = (cfg.before_turn ?? []).length > 0;
    const hasAfterTurn = (cfg.after_turn ?? []).length > 0;
    const hasBeforeTool = (cfg.before_tool_call ?? []).length > 0;
    const hasAfterTool = (cfg.after_tool_call ?? []).length > 0;
    if (!hasBeforeTurn && !hasAfterTurn && !hasBeforeTool && !hasAfterTool)
        return undefined;
    const hooks = {};
    if (hasBeforeTurn) {
        hooks.beforeTurn = async (turnIndex, messages) => {
            for (const entry of cfg.before_turn) {
                const r = await runHook(entry, { event: 'before_turn', turnIndex, messages });
                if (r.exit !== 0) {
                    process.stderr.write(`hook before_turn aborted: ${r.stderr.trim() || r.stdout.trim() || `exit=${r.exit}`}\n`);
                    return 'abort';
                }
            }
            return 'continue';
        };
    }
    if (hasAfterTurn) {
        hooks.afterTurn = async (turnIndex, usage) => {
            for (const entry of cfg.after_turn) {
                await runHook(entry, { event: 'after_turn', turnIndex, usage });
            }
        };
    }
    if (hasBeforeTool) {
        hooks.beforeToolCall = async (call) => {
            for (const entry of cfg.before_tool_call) {
                if (!matches(entry, call.name))
                    continue;
                const r = await runHook(entry, { event: 'before_tool_call', call });
                if (r.exit !== 0) {
                    return { block: true, reason: r.stderr.trim() || r.stdout.trim() || `hook ${entry.command} exited ${r.exit}` };
                }
            }
            return undefined;
        };
    }
    if (hasAfterTool) {
        hooks.afterToolCall = async (call, result) => {
            let current = result;
            for (const entry of cfg.after_tool_call) {
                if (!matches(entry, call.name))
                    continue;
                const r = await runHook(entry, { event: 'after_tool_call', call, result: current });
                // Convention: zero exit = pass through unchanged; non-zero exit
                // with stdout = replace the result content with stdout.
                if (r.exit !== 0 && r.stdout.length > 0) {
                    current = { ...current, content: r.stdout };
                }
            }
            return current;
        };
    }
    return hooks;
}
//# sourceMappingURL=config-bridge.js.map