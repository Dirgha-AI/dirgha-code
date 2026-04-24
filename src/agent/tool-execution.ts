// @ts-nocheck
/**
 * agent/tool-execution.ts — Tool execution orchestration
 *
 * Handles permission checks, routing, and execution of tools
 */
import { executeToolAsync } from "./tools.js";
import { spawnAgent } from "./spawn-agent.js";
import { getExtensionManager } from "../extensions/manager.js";
import { getMemoryManager } from "../memory/manager.js";
import { needsConfirmation } from "../permission/judge.js";
import { getStoredDecision, storeDecision } from "../permission/store.js";
import { promptConfirmation } from "../permission/confirmation.js";
import type { ContentBlock, ReplContext } from "../types.js";
// Stub types for packages/core security (avoids TS6059 rootDir errors)
type TrustLevel = "high" | "medium" | "low" | "untrusted";

const WRITE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "edit_file_all",
  "apply_patch",
  "delete_file",
]);

// Tool allowlist by trust level (implements capability attenuation).
// Tool names must match the catalogue in src/tools/defs.ts exactly.
// When adding a new tool there, add it here too or it will be blocked
// even when the user has granted full trust.
const TOOL_ALLOWLIST: Record<TrustLevel, Set<string>> = {
  high: new Set([
    ...WRITE_TOOLS,
    "make_dir",
    "run_command",
    "bash",
    "git_status",
    "git_diff",
    "git_log",
    "git_commit",
    "git_branch",
    "git_push",
    "git_stash",
    "git_patch",
    "git_auto_message",
    "checkpoint",
    "search_files",
    "list_files",
    "glob",
    "repo_map",
    "search_knowledge",
    "index_files",
    "session_search",
    "read_file",
    "read_memory",
    "save_memory",
    "write_todos",
    "ask_user",
    "execute_code",
    "web_search",
    "web_fetch",
    "qmd_search",
    "browser",
    "spawn_agent",
    "orchestrate",
    "memory_graph_add",
    "memory_graph_query",
    "memory_graph_link",
    "memory_graph_prune",
    "deploy_trigger",
    "deploy_status",
  ]),
  medium: new Set([
    "read_file",
    "search_files",
    "list_files",
    "glob",
    "repo_map",
    "search_knowledge",
    "index_files",
    "session_search",
    "git_status",
    "git_diff",
    "git_log",
    "read_memory",
    "save_memory",
    "write_todos",
    "ask_user",
    "web_search",
    "web_fetch",
    "qmd_search",
    "browser",
  ]),
  low: new Set([
    "read_file",
    "search_files",
    "list_files",
    "glob",
    "repo_map",
    "read_memory",
    "ask_user",
    "web_fetch",
  ]),
  untrusted: new Set(["read_file", "ask_user"]),
};

function isToolAllowed(tool: string, trust: TrustLevel): boolean {
  return TOOL_ALLOWLIST[trust].has(tool);
}

// Per-file async mutex — prevents concurrent write-modify-write corruption when
// the task queue processes multiple prompts that touch the same file.
const _fileLocks = new Map<string, Promise<void>>();
async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _fileLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const curr = new Promise<void>((r) => {
    release = r;
  });
  _fileLocks.set(
    key,
    prev.then(() => curr).catch(() => curr),
  );
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (_fileLocks.get(key) === curr) _fileLocks.delete(key);
  }
}

function lockKeyForTool(
  name: string,
  input: Record<string, any>,
): string | null {
  if (WRITE_TOOLS.has(name))
    return String(input["path"] ?? input["file_path"] ?? "");
  return null;
}

// Session trust level — degrades to 'untrusted' on injection detection
// Auto-recovers after 3 consecutive clean tool calls to avoid permanent session death
let sessionTrustLevel: TrustLevel = "high";
let cleanToolCallsSinceInjection = 0;

export function getSessionTrustLevel(): TrustLevel {
  return sessionTrustLevel;
}
export function resetSessionTrustLevel(): void {
  sessionTrustLevel = "high";
  cleanToolCallsSinceInjection = 0;
}

// Inline injection scanner — avoids cross-package import complexity in CLI
// Tuned to avoid false positives on docs, READMEs, and security examples.
// Only match patterns that look like active injection attempts, not references.
const INJECTION_RE = [
  /ignore\s+(all\s+)?previous\s+instructions?\s*[.!]/i, // require sentence ending to avoid doc references
  /forget\s+(your\s+)?instructions?\s+and\s/i, // only match "forget instructions AND [do something]"
  /<<SYS>>/, // Llama-specific, rare in real content
  /disregard\s+(all\s+)?previous\s+(instructions?|context)/i,
  /\u202e|\u202d/, // bidi override chars (keep, these are real attacks)
];

export function isSuspiciousToolResult(content: string): boolean {
  return INJECTION_RE.some((re) => re.test(content));
}

export function guardToolResult(content: string, toolName: string): string {
  if (!isSuspiciousToolResult(content)) return content;
  const clean = content
    .replace(/[\u202e\u202d\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return `[SECURITY: prompt injection detected in ${toolName} result — content sanitized]\n${clean}`;
}

const MEMORY_TOOLS = ["save_memory", "read_memory", "session_search"];

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export async function executeToolWithPermissions(
  block: ContentBlock & { type: "tool_use" },
  ctx: ReplContext | undefined,
  resolvedModel: string,
  onTool: (name: string, input: Record<string, any>) => void,
): Promise<ToolResultBlock> {
  const toolName = block.name ?? "";
  const toolInput = block.input ?? {};
  const toolId = block.id ?? "";
  const memMgr = getMemoryManager();
  const extMgr = getExtensionManager();

  onTool(toolName, toolInput);

  // Capability attenuation: block disallowed tools when session trust is degraded
  if (!isToolAllowed(toolName, sessionTrustLevel)) {
    return {
      type: "tool_result",
      tool_use_id: toolId,
      content: `[BLOCKED: tool '${toolName}' is not permitted at trust level '${sessionTrustLevel}']`,
    };
  }

  const permLevel = ctx?.permissionLevel ?? "WorkspaceWrite";
  if (needsConfirmation(toolName, permLevel, toolInput)) {
    let decision: string;
    try {
      const stored = getStoredDecision(toolName);
      decision = stored ?? (await promptConfirmation(toolName, toolInput));
      if (
        !stored &&
        (decision === "always_allow" || decision === "always_deny")
      ) {
        storeDecision(toolName, decision);
      }
    } catch (e) {
      return {
        type: "tool_result",
        tool_use_id: toolId,
        content: `[Permission denied: confirmation failed - ${e instanceof Error ? e.message : String(e)}]`,
      };
    }
    if (decision === "deny_once" || decision === "always_deny") {
      return {
        type: "tool_result",
        tool_use_id: toolId,
        content: "[Permission denied by user]",
      };
    }
  }

  const lockKey = lockKeyForTool(toolName, toolInput as Record<string, any>);
  const execFn = async () =>
    MEMORY_TOOLS.includes(toolName)
      ? {
          tool: toolName,
          result: await memMgr.handleToolCall(toolName, toolInput),
        }
      : toolName === "spawn_agent"
        ? await spawnAgent(toolInput as any, resolvedModel)
        : extMgr.hasExtensions() && toolName.includes("__")
          ? {
              tool: toolName,
              result: await extMgr.callTool(toolName, toolInput),
            }
          : await executeToolAsync(toolName, toolInput, ctx);
  const result = lockKey ? await withFileLock(lockKey, execFn) : await execFn();

  const rawContent = result.error ? `Error: ${result.error}` : result.result;
  const guarded = result.error
    ? rawContent
    : guardToolResult(String(rawContent ?? ""), toolName);
  // If injection was detected, degrade session trust for subsequent tool calls
  if (typeof guarded === "string" && guarded.startsWith("[SECURITY:")) {
    sessionTrustLevel = "untrusted";
    cleanToolCallsSinceInjection = 0;
  } else if (sessionTrustLevel === "untrusted") {
    // Auto-recover after 3 consecutive clean tool results
    cleanToolCallsSinceInjection++;
    if (cleanToolCallsSinceInjection >= 3) {
      sessionTrustLevel = "high";
      cleanToolCallsSinceInjection = 0;
    }
  }
  return { type: "tool_result", tool_use_id: toolId, content: guarded };
}

export async function executeAllTools(
  toolBlocks: Array<ContentBlock & { type: "tool_use" }>,
  ctx: ReplContext | undefined,
  resolvedModel: string,
  onTool: (name: string, input: Record<string, any>) => void,
): Promise<ToolResultBlock[]> {
  const promises = toolBlocks.map((block) =>
    executeToolWithPermissions(block, ctx, resolvedModel, onTool),
  );
  return Promise.all(promises);
}
