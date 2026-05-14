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

import type { ToolCall, ToolResult, ToolExecutor, ToolErrorKind } from "../kernel/types.js";
import type {
  Tool,
  ToolContext,
  ToolRegistry,
  SandboxMode,
} from "./registry.js";
import type { SandboxAdapter } from "../safety/sandbox/iface.js";
import type { PermissionEngine } from "./permission.js";
import { selectSandbox } from "../safety/sandbox/select.js";
import { wrapLegacyResult, internalError } from './result-wrappers.js';

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
  autoApprove?: boolean;
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

function toolError(kind: ToolErrorKind, message: string, opts: { durationMs?: number; fatal_to_loop?: boolean; cause?: unknown } = {}): ToolResult {
  const r = internalError(kind, message);
  if (opts.durationMs !== undefined) r.durationMs = opts.durationMs;
  if (r.isError === true && r.error) {
    if (opts.fatal_to_loop !== undefined) r.error.fatal_to_loop = opts.fatal_to_loop;
    if (opts.cause !== undefined) r.error.cause = opts.cause;
  }
  return r;
}

export function createToolExecutor(opts: ToolExecutorOptions): ToolExecutor {
  const env = opts.env ?? sanitiseEnv(process.env);

  // Resolve the platform sandbox adapter once per executor instance.
  // Falls back to null if selectSandbox throws (unsupported platform or
  // misconfigured DIRGHA_SANDBOX override). Tools receive the adapter via
  // ToolContext.sandbox and may opt in to sandbox execution.
  let sandboxPromise: Promise<SandboxAdapter | null>;
  try {
    sandboxPromise = selectSandbox().catch(() => null);
  } catch {
    sandboxPromise = Promise.resolve(null);
  }

  return {
    async execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
      let tool = opts.registry.get(call.name);
      if (!tool && opts.lazyLoadPromise) {
        // MCP servers may still be loading — wait for the lazy-load to
        // finish, then retry the lookup once before giving up.
        await opts.lazyLoadPromise;
        tool = opts.registry.get(call.name);
      }
      if (!tool) {
        const available = opts.registry.list().map((t: Tool) => t.name);
        const suggestions = closestMatches(call.name, available, 3);
        return toolError('tool_not_found', `Tool "${call.name}" is not registered. ${available.length} tools available. ${suggestions.length > 0 ? 'Did you mean: ' + suggestions.join(', ') + '?' : 'Use the tool registry list to see what is callable.'}`);
      }
      if (opts.permission) {
        const decision = opts.permission.check({
          tool: call.name,
          action: "exec",
          target: opts.cwd,
        });
        if (!decision.allowed) {
          return toolError('permission', `Permission denied: ${decision.reason}`);
        }
      }
      const sandbox = await sandboxPromise;
      const ctx: ToolContext = {
        cwd: opts.cwd,
        env,
        sessionId: opts.sessionId,
        signal,
        sandbox,
        sandboxMode: opts.sandboxMode ?? "off",
        autoApprove: opts.autoApprove,
        log: opts.log,
        onProgress: opts.onProgress
          ? (msg: string) => opts.onProgress!(call.id, msg)
          : undefined,
      };
      try {
        return await runTool(tool, call.input, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return toolError('internal', `Tool "${call.name}" failed: ${msg}`, { cause: err });
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
  const deadlineMs = tool.timeoutMs ?? 0;

  // Race tool.execute against ctx.signal so ESC aborts immediately
  // instead of waiting for tool completion. Tolerate legacy callers
  // and test harnesses that pass a ctx without a signal — the abort
  // race is then a never-resolving promise that simply waits for the
  // tool/timeout to settle, identical to pre-fix behaviour for those
  // callers. The real agent loop always passes a signal so the abort
  // behaviour is preserved end-to-end.
  const abortPromise = ctx.signal
    ? new Promise<ToolResult>((resolve) => {
        if (ctx.signal!.aborted) {
          resolve(toolError('aborted', `Tool "${tool.name}" aborted before start.`));
          return;
        }
        ctx.signal!.addEventListener(
          "abort",
          () => {
            resolve(toolError('aborted', `Tool "${tool.name}" aborted by user (signal).`, { durationMs: Date.now() - started }));
          },
          { once: true },
        );
      })
    : new Promise<ToolResult>(() => {
        /* never resolves — caller passed no AbortSignal */
      });

  let result: ToolResult;
  if (deadlineMs > 0) {
    result = await Promise.race([
      tool.execute(input, ctx),
      abortPromise,
      new Promise<ToolResult>((resolve) => {
        const timer = setTimeout(() => {
          resolve(toolError('timeout', `Tool "${tool.name}" timed out after ${deadlineMs}ms.`, { durationMs: deadlineMs }));
        }, deadlineMs);
        ctx.signal?.addEventListener("abort", () => clearTimeout(timer), {
          once: true,
        });
      }),
    ]);
  } else {
    result = await Promise.race([tool.execute(input, ctx), abortPromise]);
  }
  const finalDuration = result.durationMs ?? Date.now() - started;
  // Canonicalise: every result reaches the agent loop as a v2 ToolResult
  // with `ok` field set, regardless of which shape the tool returned.
  const wrapped = wrapLegacyResult(result, 'external');
  if (wrapped.durationMs === undefined) wrapped.durationMs = finalDuration;
  return wrapped;
}

function sanitiseEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function closestMatches(needle: string, haystack: string[], k: number): string[] {
  // Simple Levenshtein-distance approximation with prefix fallback.
  const distance = (a: string, b: string): number => {
    if (a.length < b.length) [a, b] = [b, a];
    return a.split('').reduce((acc, c, i) => acc + (c !== b[i] ? 1 : 0), 0);
  };
  return haystack
    .filter(h => h.startsWith(needle.slice(0, 3)) || distance(needle, h) <= 2)
    .sort((a, b) => distance(needle, a) - distance(needle, b))
    .slice(0, k);
}
