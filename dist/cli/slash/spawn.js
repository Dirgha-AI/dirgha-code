/**
 * /spawn <prompt> — dispatch an in-process sub-agent via SubagentDelegator.
 *
 * Uses the current provider and model from SlashContext. Because SlashContext
 * does not expose a ToolRegistry or cwd, tools are disabled (toolAllowlist: [])
 * so the sub-agent runs as a pure LLM reasoning step with no file-system access.
 * Use `dirgha fleet` when you need a full tool-capable agent.
 */
import { SubagentDelegator } from "../../subagents/delegator.js";
export const spawnCommand = {
    name: "spawn",
    description: "Dispatch an in-process sub-agent: /spawn <prompt>",
    async execute(args, ctx) {
        const prompt = args.join(" ").trim();
        if (!prompt) {
            return "Usage: /spawn <prompt>";
        }
        const provider = ctx.getProvider();
        if (!provider) {
            return "spawn: no provider available — start a session first.";
        }
        const delegator = new SubagentDelegator({
            // SlashContext does not expose a ToolRegistry; supply an empty shim so
            // the delegator constructs without error. toolAllowlist: [] ensures no
            // tools are filtered in, making the scoped registry a no-op.
            registry: {
                register() { throw new Error("spawn: registry is read-only"); },
                unregister() { return false; },
                has() { return false; },
                get() { return undefined; },
                list() { return []; },
                sanitize() { return { definitions: [], nameSet: new Set() }; },
            },
            provider,
            defaultModel: ctx.model,
            cwd: process.cwd(),
            parentSessionId: ctx.sessionId,
        });
        const start = Date.now();
        try {
            const result = await delegator.delegate({
                prompt,
                toolAllowlist: [], // disable all tools — pure reasoning only
                maxTurns: 5,
            });
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            const summary = `[spawn done in ${elapsed}s, ${result.stopReason}]`;
            return result.output
                ? `${result.output}\n\n${summary}`
                : summary;
        }
        catch (err) {
            return `spawn error: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
//# sourceMappingURL=spawn.js.map