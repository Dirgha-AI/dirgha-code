/**
 * `dirgha ask "prompt"` — headless one-shot with tools.
 *
 * Semantically equivalent to passing a bare positional prompt to
 * `dirgha` on the command line (handled in main.ts), but spelled
 * explicitly so scripts can be self-documenting and unambiguous. We
 * default `--max-turns` to 30 (v1 parity) and forward everything else
 * through the main agent path.
 *
 * Implementation mirrors main.ts's non-interactive branch — we don't
 * delegate to it because that path lives inside a top-level async
 * `main()` with early exits, which makes it awkward to reuse as a
 * function. Keeping the one-shot pipeline here keeps the subcommand
 * composable and testable.
 */
import { stdout, stderr } from "node:process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseFlags } from "../flags.js";
import { loadConfig } from "../config.js";
import { ProviderRegistry } from "../../providers/index.js";
import { builtInTools, createToolExecutor, createToolRegistry, } from "../../tools/index.js";
import { createEventStream } from "../../kernel/event-stream.js";
import { runAgentLoop } from "../../kernel/agent-loop.js";
import { renderStreamingEvents } from "../../tui/renderer.js";
const DEFAULT_ASK_MAX_TURNS = 30;
export const askSubcommand = {
    name: "ask",
    description: "Headless one-shot agent (with tools, --max-turns 30 default)",
    async run(argv, ctx) {
        const { flags, positionals } = parseFlags(argv);
        const prompt = positionals.join(" ").trim();
        if (!prompt) {
            stderr.write('usage: dirgha ask "your prompt" [-m <model>] [-s <system>] [--max-turns N] [--cwd <dir>] [--json]\n');
            return 1;
        }
        // Honour --cwd so callers can scope tool calls to a specific directory
        // without spawning the whole process under that dir. Falls back to the
        // SubcommandCtx-supplied cwd (which is process.cwd()).
        const cwdFlag = typeof flags.cwd === "string" ? flags.cwd : undefined;
        const cwd = cwdFlag ? resolve(cwdFlag) : ctx.cwd;
        if (cwdFlag && !existsSync(cwd)) {
            stderr.write(`--cwd: directory does not exist: ${cwd}\n`);
            return 1;
        }
        const config = await loadConfig(cwd);
        const { resolveModelAlias } = await import("../../intelligence/prices.js");
        const rawModel = typeof flags.model === "string"
            ? flags.model
            : typeof flags.m === "string"
                ? flags.m
                : config.model;
        const model = resolveModelAlias(rawModel);
        const system = typeof flags.system === "string"
            ? flags.system
            : typeof flags.s === "string"
                ? flags.s
                : undefined;
        const maxTurns = typeof flags["max-turns"] === "string"
            ? Number.parseInt(flags["max-turns"], 10)
            : DEFAULT_ASK_MAX_TURNS;
        const json = flags.json === true;
        const providers = new ProviderRegistry();
        const registry = createToolRegistry(builtInTools);
        // Register `task` tool for sub-agent delegation (same pattern as main.ts).
        const { SubagentDelegator } = await import("../../subagents/delegator.js");
        const { createTaskTool } = await import("../../tools/task.js");
        const taskDelegatorRef = { current: null };
        registry.register(createTaskTool({
            delegate: async (req) => {
                if (!taskDelegatorRef.current)
                    throw new Error("subagent delegator not yet initialised");
                return taskDelegatorRef.current.delegate(req);
            },
        }));
        const sessionId = randomUUID();
        const events = createEventStream();
        if (json)
            events.subscribe((ev) => {
                stdout.write(`${JSON.stringify(ev)}\n`);
            });
        else
            events.subscribe(renderStreamingEvents({ showThinking: config.showThinking }));
        const executor = createToolExecutor({ registry, cwd, sessionId });
        const sanitized = registry.sanitize({ descriptionLimit: 200 });
        const messages = [];
        if (system)
            messages.push({ role: "system", content: system });
        messages.push({ role: "user", content: prompt });
        const provider = providers.forModel(model);
        taskDelegatorRef.current = new SubagentDelegator({
            registry,
            provider,
            defaultModel: model,
            cwd,
            parentSessionId: sessionId,
        });
        const result = await runAgentLoop({
            sessionId,
            model,
            messages,
            tools: sanitized.definitions,
            maxTurns,
            provider,
            toolExecutor: executor,
            events,
        });
        if (!json)
            stdout.write("\n");
        return result.stopReason === "error" ? 2 : 0;
    },
};
//# sourceMappingURL=ask.js.map