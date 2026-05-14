/**
 * Central tool executor used by the agent loop.
 *
 * Looks up the tool by name, validates input shape best-effort, runs
 * the tool's execute() under the caller's AbortSignal, and returns a
 * ToolResult. Tools themselves own their error handling; the executor
 * converts unexpected exceptions into a uniform error result.
 *
 * When an onProgress callback is provided, tools that emit streaming
 * progress push events back through the agent-loop event stream.
 */
import { selectSandbox } from "../safety/sandbox/select.js";
export function createToolExecutor(opts) {
    const env = opts.env ?? sanitiseEnv(process.env);
    // Resolve the platform sandbox adapter once per executor instance.
    // Falls back to null if selectSandbox throws (unsupported platform or
    // misconfigured DIRGHA_SANDBOX override). Tools receive the adapter via
    // ToolContext.sandbox and may opt in to sandbox execution.
    let sandboxPromise;
    try {
        sandboxPromise = selectSandbox().catch(() => null);
    }
    catch {
        sandboxPromise = Promise.resolve(null);
    }
    return {
        async execute(call, signal) {
            let tool = opts.registry.get(call.name);
            if (!tool && opts.lazyLoadPromise) {
                // MCP servers may still be loading — wait for the lazy-load to
                // finish, then retry the lookup once before giving up.
                await opts.lazyLoadPromise;
                tool = opts.registry.get(call.name);
            }
            if (!tool) {
                const available = opts.registry.list().map((t) => t.name);
                const suggestions = closestMatches(call.name, available, 3);
                return {
                    content: `Tool "${call.name}" is not registered. ${available.length} tools available. ${suggestions.length > 0 ? 'Did you mean: ' + suggestions.join(', ') + '?' : 'Use the tool registry list to see what is callable.'}`,
                    isError: true,
                };
            }
            if (opts.permission) {
                const decision = opts.permission.check({
                    tool: call.name,
                    action: "exec",
                    target: opts.cwd,
                });
                if (!decision.allowed) {
                    return {
                        content: `Permission denied: ${decision.reason}`,
                        isError: true,
                    };
                }
            }
            const sandbox = await sandboxPromise;
            const ctx = {
                cwd: opts.cwd,
                env,
                sessionId: opts.sessionId,
                signal,
                sandbox,
                sandboxMode: opts.sandboxMode ?? "off",
                autoApprove: opts.autoApprove,
                log: opts.log,
                onProgress: opts.onProgress
                    ? (msg) => opts.onProgress(call.id, msg)
                    : undefined,
            };
            try {
                return await runTool(tool, call.input, ctx);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return { content: `Tool "${call.name}" failed: ${msg}`, isError: true };
            }
        },
    };
}
async function runTool(tool, input, ctx) {
    const started = Date.now();
    const deadlineMs = tool.timeoutMs ?? 0;
    // Race tool.execute against ctx.signal so ESC aborts immediately
    // instead of waiting for tool completion. Tolerate legacy callers
    // and test harnesses that pass a ctx without a signal — the abort
    // race is then a never-resolving promise that simply waits for the
    // tool/timeout to settle, identical to pre-fix behaviour for those
    // callers. The real agent loop always passes a signal so the abort
    // behaviour is preserved end-to-end.
    const abortPromise = ctx.signal
        ? new Promise((resolve) => {
            if (ctx.signal.aborted) {
                resolve({
                    content: `Tool "${tool.name}" aborted before start.`,
                    isError: true,
                });
                return;
            }
            ctx.signal.addEventListener("abort", () => {
                resolve({
                    content: `Tool "${tool.name}" aborted by user (signal).`,
                    isError: true,
                    durationMs: Date.now() - started,
                });
            }, { once: true });
        })
        : new Promise(() => {
            /* never resolves — caller passed no AbortSignal */
        });
    let result;
    if (deadlineMs > 0) {
        result = await Promise.race([
            tool.execute(input, ctx),
            abortPromise,
            new Promise((resolve) => {
                const timer = setTimeout(() => {
                    resolve({
                        content: `Tool "${tool.name}" timed out after ${deadlineMs}ms.`,
                        isError: true,
                        durationMs: deadlineMs,
                    });
                }, deadlineMs);
                ctx.signal?.addEventListener("abort", () => clearTimeout(timer), {
                    once: true,
                });
            }),
        ]);
    }
    else {
        result = await Promise.race([tool.execute(input, ctx), abortPromise]);
    }
    result.durationMs = result.durationMs ?? Date.now() - started;
    return result;
}
function sanitiseEnv(source) {
    const out = {};
    for (const [k, v] of Object.entries(source)) {
        if (v === undefined)
            continue;
        out[k] = v;
    }
    return out;
}
function closestMatches(needle, haystack, k) {
    // Simple Levenshtein-distance approximation with prefix fallback.
    const distance = (a, b) => {
        if (a.length < b.length)
            [a, b] = [b, a];
        return a.split('').reduce((acc, c, i) => acc + (c !== b[i] ? 1 : 0), 0);
    };
    return haystack
        .filter(h => h.startsWith(needle.slice(0, 3)) || distance(needle, h) <= 2)
        .sort((a, b) => distance(needle, a) - distance(needle, b))
        .slice(0, k);
}
//# sourceMappingURL=exec.js.map