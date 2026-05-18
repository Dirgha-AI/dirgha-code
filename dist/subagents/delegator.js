/**
 * Subagent delegation.
 *
 * Exposes a task executor that spawns an isolated agent-loop instance
 * with its own session, its own event stream, and an optional restricted
 * tool subset. The parent receives only the final text output; the full
 * transcript is preserved in the child session for audit.
 */
import { randomUUID } from "node:crypto";
import { createEventStream } from "../kernel/event-stream.js";
import { runAgentLoop } from "../kernel/agent-loop.js";
import { extractText } from "../kernel/message.js";
import { createToolExecutor } from "../tools/exec.js";
import { LoopDetector } from "../subagents/loop-detector.js";
import { createSessionStore } from "../context/session.js";
/**
 * Safe default tool allowlist for sub-agents. Covers read/write/search and
 * common dev operations while excluding high-privilege tools (e.g. network
 * requests, approval bypass, registry mutation). A parent agent can grant
 * additional tools by supplying an explicit toolAllowlist on SubagentRequest.
 *
 * NOTE: these names MUST match the actual tool.name in the registry.
 * See src/tools/registry.ts for the canonical list.
 */
export const DEFAULT_SUBAGENT_TOOLS = new Set([
    'fs_read', 'fs_write', 'fs_edit', 'search_grep', 'search_glob',
    'shell', 'browser', 'go_to_definition', 'find_references', 'hover_documentation',
    'document_symbols', 'git', 'task', 'rtk',
]);
export class SubagentDelegator {
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    async delegate(req) {
        const sessionId = `${this.opts.parentSessionId}-sub-${randomUUID().slice(0, 8)}`;
        const events = createEventStream();
        // Use `!== undefined` (not truthiness) so an explicit empty array []
        // is honoured as "no tools" rather than falling through to defaults.
        // An array of length 0 is truthy in JS, so `req.toolAllowlist ?` would
        // also produce an empty set — but the intent is clearer and safer here.
        const allowlist = req.toolAllowlist !== undefined
            ? new Set(req.toolAllowlist)
            : DEFAULT_SUBAGENT_TOOLS;
        const filteredTools = this.opts.registry.list().filter((t) => allowlist.has(t.name));
        // Enforce: when allowlist is empty (toolAllowlist: []), filteredTools must
        // be empty so the LLM receives zero tool definitions — not just zero
        // executable tools. The scoped registry built below is the sole source of
        // `sanitized.definitions` passed to runAgentLoop.
        if (req.toolAllowlist !== undefined && req.toolAllowlist.length === 0) {
            // filteredTools is already [] from the filter above; this assertion
            // documents the invariant so future refactors cannot silently break it.
            if (filteredTools.length !== 0) {
                throw new Error("toolAllowlist contract violation: toolAllowlist is [] but filteredTools is non-empty");
            }
        }
        const scoped = new Map();
        for (const t of filteredTools)
            scoped.set(t.name, t);
        const scopedRegistry = createScopedRegistry(scoped);
        const sanitized = scopedRegistry.sanitize({ descriptionLimit: 200 });
        const executor = createToolExecutor({
            registry: scopedRegistry,
            cwd: this.opts.cwd,
            sessionId,
        });
        const messages = [];
        if (req.system)
            messages.push({ role: "system", content: req.system });
        messages.push({ role: "user", content: req.prompt });
        // Create a persistent session for the sub-agent so its transcript is
        // crash-safe and available via /resume and dirgha export-session.
        const sessions = createSessionStore();
        const subSession = await sessions.create(sessionId);
        // Append the initial user prompt so the session has a recoverable prefix.
        void subSession.append({ type: "message", ts: new Date().toISOString(), message: messages[messages.length - 1] });
        const loopDetector = new LoopDetector();
        // Resolve the provider for the requested model. When providers is given,
        // route through the registry so different models reach different providers.
        // Fall back to the deprecated single-provider field for backward compat.
        const resolvedModel = req.model ?? this.opts.defaultModel;
        const provider = this.opts.providers
            ? this.opts.providers.forModel(resolvedModel)
            : this.opts.provider;
        const result = await runAgentLoop({
            sessionId,
            model: resolvedModel,
            messages,
            tools: sanitized.definitions,
            maxTurns: req.maxTurns ?? 6,
            provider,
            toolExecutor: executor,
            events,
            session: subSession,
            loopDetector,
        });
        // Persist any messages the agent loop didn't already append via session.
        for (const msg of result.messages) {
            void subSession.append({ type: "message", ts: new Date().toISOString(), message: msg });
        }
        subSession.close();
        const lastAssistant = [...result.messages]
            .reverse()
            .find((m) => m.role === "assistant");
        // Include the raw error message when the loop errored with no output
        let output = "";
        if (lastAssistant) {
            output = extractText(lastAssistant);
        }
        else if (result.stopReason === "error") {
            // Try to extract an error message from the last user/tool messages
            const lastMsg = result.messages[result.messages.length - 1];
            output = lastMsg && lastMsg.role === "tool"
                ? `[sub-agent error] ${extractText(lastMsg).slice(0, 500)}`
                : `[sub-agent error] loop stopped with reason: ${result.stopReason}`;
        }
        const returnValue = {
            output,
            usage: result.usage,
            transcript: result.messages,
            stopReason: result.stopReason,
            sessionId,
        };
        if (req.tokenBudget !== undefined && result.usage.outputTokens > req.tokenBudget) {
            // Log warning but don't throw — return what we have with a note
            return {
                ...returnValue,
                output: returnValue.output + `\n\n[token budget of ${req.tokenBudget} exceeded: ${result.usage.outputTokens} output tokens used]`,
            };
        }
        return returnValue;
    }
}
function createScopedRegistry(tools) {
    return {
        register() {
            throw new Error("scoped registry is read-only");
        },
        unregister() {
            return false;
        },
        has: (name) => tools.has(name),
        get: (name) => tools.get(name),
        list: () => [...tools.values()],
        sanitize(opts) {
            const limit = opts?.descriptionLimit ?? Number.POSITIVE_INFINITY;
            const definitions = [];
            const nameSet = new Set();
            for (const tool of tools.values()) {
                const description = tool.description.length > limit
                    ? `${tool.description.slice(0, limit - 3)}...`
                    : tool.description;
                definitions.push({
                    name: tool.name,
                    description,
                    inputSchema: tool.inputSchema,
                });
                nameSet.add(tool.name);
            }
            return { definitions, nameSet };
        },
    };
}
//# sourceMappingURL=delegator.js.map