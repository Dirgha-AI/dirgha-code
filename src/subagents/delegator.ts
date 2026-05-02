/**
 * Subagent delegation.
 *
 * Exposes a task executor that spawns an isolated agent-loop instance
 * with its own session, its own event stream, and an optional restricted
 * tool subset. The parent receives only the final text output; the full
 * transcript is preserved in the child session for audit.
 */

import { randomUUID } from "node:crypto";
import type {
  Provider,
  ToolDefinition,
  UsageTotal,
  Message,
} from "../kernel/types.js";
import { createEventStream } from "../kernel/event-stream.js";
import { runAgentLoop } from "../kernel/agent-loop.js";
import { extractText } from "../kernel/message.js";
import type { Tool, ToolRegistry } from "../tools/registry.js";
import { createToolExecutor } from "../tools/exec.js";
import { LoopDetector } from "../subagents/loop-detector.js";

/**
 * Safe default tool allowlist for sub-agents. Covers read/write/search and
 * common dev operations while excluding high-privilege tools (e.g. network
 * requests, approval bypass, registry mutation). A parent agent can grant
 * additional tools by supplying an explicit toolAllowlist on SubagentRequest.
 */
export const DEFAULT_SUBAGENT_TOOLS = new Set([
  'read_file', 'write_file', 'edit_file', 'search_grep', 'search_glob',
  'shell', 'browser', 'go_to_definition', 'find_references', 'hover',
  'list_symbols', 'git_read', 'task',
]);

export interface SubagentRequest {
  prompt: string;
  system?: string;
  toolAllowlist?: string[];
  maxTurns?: number;
  model?: string;
  tokenBudget?: number; // max output tokens before aborting
}

export interface SubagentResult {
  output: string;
  usage: UsageTotal;
  transcript: Message[];
  stopReason: string;
  sessionId: string;
}

export interface DelegatorOptions {
  registry: ToolRegistry;
  provider: Provider;
  defaultModel: string;
  cwd: string;
  parentSessionId: string;
}

export class SubagentDelegator {
  constructor(private opts: DelegatorOptions) {}

  async delegate(req: SubagentRequest): Promise<SubagentResult> {
    const sessionId = `${this.opts.parentSessionId}-sub-${randomUUID().slice(0, 8)}`;
    const events = createEventStream();
    const allowlist = req.toolAllowlist
      ? new Set(req.toolAllowlist)
      : DEFAULT_SUBAGENT_TOOLS;
    const filteredTools: Tool[] = this.opts.registry.list().filter(
      (t) => allowlist.has(t.name),
    );

    const scoped = new Map<string, Tool>();
    for (const t of filteredTools) scoped.set(t.name, t);
    const scopedRegistry = createScopedRegistry(scoped);

    const sanitized = scopedRegistry.sanitize({ descriptionLimit: 200 });
    const executor = createToolExecutor({
      registry: scopedRegistry,
      cwd: this.opts.cwd,
      sessionId,
    });

    const messages: Message[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.prompt });

    const loopDetector = new LoopDetector();

    const result = await runAgentLoop({
      sessionId,
      model: req.model ?? this.opts.defaultModel,
      messages,
      tools: sanitized.definitions,
      maxTurns: req.maxTurns ?? 6,
      provider: this.opts.provider,
      toolExecutor: executor,
      events,
      loopDetector,
    });

    const lastAssistant = [...result.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const returnValue: SubagentResult = {
      output: lastAssistant ? extractText(lastAssistant) : "",
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

function createScopedRegistry(tools: Map<string, Tool>): ToolRegistry {
  return {
    register() {
      throw new Error("scoped registry is read-only");
    },
    unregister() {
      return false;
    },
    has: (name: string) => tools.has(name),
    get: (name: string) => tools.get(name),
    list: () => [...tools.values()],
    sanitize(opts?: { descriptionLimit?: number }) {
      const limit = opts?.descriptionLimit ?? Number.POSITIVE_INFINITY;
      const definitions: ToolDefinition[] = [];
      const nameSet = new Set<string>();
      for (const tool of tools.values()) {
        const description =
          tool.description.length > limit
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
  } as unknown as ToolRegistry;
}
