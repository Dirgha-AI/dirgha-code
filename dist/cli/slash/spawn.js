/**
 * /spawn <prompt> — dispatch an in-process sub-agent via SubagentDelegator.
 *
 * Uses the current provider and model from SlashContext. SlashContext does not
 * expose a ToolRegistry, so we build a minimal read-only registry directly
 * from builtInTools filtered to a safe read-only subset. This gives the
 * sub-agent file-read and search capability needed for coding tasks without
 * exposing write/shell/network tools.
 *
 * Use `dirgha fleet` when you need a full write-capable agent.
 */
import { SubagentDelegator } from "../../subagents/delegator.js";
import { builtInTools, createToolRegistry } from "../../tools/index.js";
/**
 * Read-only tool names available to /spawn sub-agents.
 * Does NOT include write (fs_write, fs_edit), shell, browser, cron, or
 * checkpoint — those require user approval flows not present in slash context.
 */
const READ_ONLY_TOOLS = new Set([
    'fs_read',
    'fs_ls',
    'search_grep',
    'search_glob',
    'git',
    'go_to_definition',
    'find_references',
    'hover_documentation',
    'document_symbols',
]);
const spawnRegistry = createToolRegistry(builtInTools.filter((t) => READ_ONLY_TOOLS.has(t.name)));
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
            registry: spawnRegistry,
            provider,
            defaultModel: ctx.model,
            cwd: process.cwd(),
            parentSessionId: ctx.sessionId,
        });
        const start = Date.now();
        try {
            const result = await delegator.delegate({
                prompt,
                // READ_ONLY_TOOLS allowlist is enforced; sub-agent cannot call write
                // or shell tools even if it attempts to, because they are absent from
                // spawnRegistry.list() and will not appear in the LLM's tool list.
                toolAllowlist: [...READ_ONLY_TOOLS],
                maxTurns: 8,
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