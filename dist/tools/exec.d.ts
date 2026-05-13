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
import type { ToolExecutor } from "../kernel/types.js";
import type { ToolContext, ToolRegistry, SandboxMode } from "./registry.js";
import type { PermissionEngine } from "./permission.js";
export type { ToolExecutor } from "../kernel/types.js";
export interface ToolExecutorOptions {
    registry: ToolRegistry;
    cwd: string;
    env?: Record<string, string>;
    sessionId: string;
    log?: ToolContext["log"];
    onProgress?: (toolId: string, message: string) => void;
    permission?: PermissionEngine;
    /** User-selected sandbox mode (config + /sandbox slash command).
     *  Defaults to "off" when omitted (backwards compatible). */
    sandboxMode?: SandboxMode;
    /**
     * Optional promise that, when pending, defers the "not registered" error
     * until after it resolves. Used for lazy-loaded MCP servers: the first
     * tool call may arrive before MCP has finished loading; rather than
     * returning "not registered", the executor awaits the lazy-load promise
     * and retries the lookup once.
     */
    lazyLoadPromise?: Promise<void>;
}
export declare function createToolExecutor(opts: ToolExecutorOptions): ToolExecutor;
