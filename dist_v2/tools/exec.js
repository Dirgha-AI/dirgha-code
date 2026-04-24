/**
 * Central tool executor used by the agent loop.
 *
 * Looks up the tool by name, validates input shape best-effort, runs
 * the tool's execute() under the caller's AbortSignal, and returns a
 * ToolResult. Tools themselves own their error handling; the executor
 * converts unexpected exceptions into a uniform error result.
 */
export function createToolExecutor(opts) {
    const env = opts.env ?? sanitiseEnv(process.env);
    return {
        async execute(call, signal) {
            const tool = opts.registry.get(call.name);
            if (!tool) {
                return { content: `Tool "${call.name}" is not registered.`, isError: true };
            }
            const ctx = {
                cwd: opts.cwd,
                env,
                sessionId: opts.sessionId,
                signal,
                log: opts.log,
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
    const result = await tool.execute(input, ctx);
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
//# sourceMappingURL=exec.js.map