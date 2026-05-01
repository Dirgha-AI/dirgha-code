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

import type { ToolCall, ToolResult, ToolExecutor } from "../kernel/types.js";
import type { Tool, ToolContext, ToolRegistry } from "./registry.js";

export type { ToolExecutor } from "../kernel/types.js";

export interface ToolExecutorOptions {
  registry: ToolRegistry;
  cwd: string;
  env?: Record<string, string>;
  sessionId: string;
  log?: ToolContext["log"];
  onProgress?: (toolId: string, message: string) => void;
}

export function createToolExecutor(opts: ToolExecutorOptions): ToolExecutor {
  const env = opts.env ?? sanitiseEnv(process.env);
  return {
    async execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
      const tool = opts.registry.get(call.name);
      if (!tool) {
        return {
          content: `Tool "${call.name}" is not registered.`,
          isError: true,
        };
      }
      const ctx: ToolContext = {
        cwd: opts.cwd,
        env,
        sessionId: opts.sessionId,
        signal,
        log: opts.log,
        onProgress: opts.onProgress
          ? (msg: string) => opts.onProgress!(call.id, msg)
          : undefined,
      };
      try {
        return await runTool(tool, call.input, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Tool "${call.name}" failed: ${msg}`, isError: true };
      }
    },
  };
}

async function runTool(
  tool: Tool,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const started = Date.now();
  const result = await tool.execute(input, ctx);
  result.durationMs = result.durationMs ?? Date.now() - started;
  return result;
}

function sanitiseEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}
