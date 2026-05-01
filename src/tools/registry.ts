/**
 * Tool registry.
 *
 * Two concerns:
 *   (a) Hold the set of registered Tools and expose them to the agent
 *       loop as bare ToolDefinitions (the provider-visible subset).
 *   (b) Sanitise the outbound tool set per model — some hosted models
 *       reject very long descriptions or lack tool-use capability
 *       entirely.
 */

import type {
  JsonSchema,
  ToolDefinition,
  ToolResult,
} from "../kernel/types.js";

export interface ToolContext {
  cwd: string;
  env: Record<string, string>;
  sessionId: string;
  signal: AbortSignal;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    msg: string,
    meta?: Record<string, unknown>,
  ) => void;
  onProgress?: (message: string) => void;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiresApproval?: (input: unknown) => boolean;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface SanitizedToolSet {
  definitions: ToolDefinition[];
  nameSet: Set<string>;
}

export interface SanitizeOptions {
  descriptionLimit?: number;
  allowlist?: Set<string>;
  denylist?: Set<string>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (!tool.name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  sanitize(opts: SanitizeOptions = {}): SanitizedToolSet {
    const limit = opts.descriptionLimit ?? Number.POSITIVE_INFINITY;
    const definitions: ToolDefinition[] = [];
    const nameSet = new Set<string>();

    for (const tool of this.tools.values()) {
      if (opts.allowlist && !opts.allowlist.has(tool.name)) continue;
      if (opts.denylist && opts.denylist.has(tool.name)) continue;
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
  }
}

export function createToolRegistry(tools: Tool[] = []): ToolRegistry {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  return registry;
}
