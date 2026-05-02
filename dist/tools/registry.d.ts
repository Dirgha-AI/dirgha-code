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
import type { JsonSchema, ToolDefinition, ToolResult } from "../kernel/types.js";
import type { SandboxAdapter } from "../safety/sandbox/iface.js";
export interface ToolContext {
    cwd: string;
    env: Record<string, string>;
    sessionId: string;
    signal: AbortSignal;
    /** Platform sandbox adapter, or null when sandbox is unavailable. */
    sandbox: SandboxAdapter | null;
    log?: (level: "debug" | "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) => void;
    onProgress?: (message: string) => void;
}
export interface Tool {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    /** Maximum milliseconds before the executor aborts this tool. 0 = no limit. */
    timeoutMs?: number;
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
export declare class ToolRegistry {
    private readonly tools;
    register(tool: Tool): void;
    unregister(name: string): boolean;
    has(name: string): boolean;
    get(name: string): Tool | undefined;
    list(): Tool[];
    sanitize(opts?: SanitizeOptions): SanitizedToolSet;
}
export declare function createToolRegistry(tools?: Tool[]): ToolRegistry;
