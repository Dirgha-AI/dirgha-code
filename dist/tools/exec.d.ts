/**
 * Central tool executor used by the agent loop.
 *
 * Looks up the tool by name, validates input shape best-effort, runs
 * the tool's execute() under the caller's AbortSignal, and returns a
 * ToolResult. Tools themselves own their error handling; the executor
 * converts unexpected exceptions into a uniform error result.
 */
import type { ToolExecutor } from '../kernel/types.js';
import type { ToolContext, ToolRegistry } from './registry.js';
export type { ToolExecutor } from '../kernel/types.js';
export interface ToolExecutorOptions {
    registry: ToolRegistry;
    cwd: string;
    env?: Record<string, string>;
    sessionId: string;
    log?: ToolContext['log'];
}
export declare function createToolExecutor(opts: ToolExecutorOptions): ToolExecutor;
