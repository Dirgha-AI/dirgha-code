/**
 * Bridges user-defined hooks from `~/.dirgha/config.json` into the
 * `AgentHooks` shape expected by `runAgentLoop`. Each configured hook
 * is a shell command executed at the matching lifecycle event:
 *
 *   before_turn       → AgentHooks.beforeTurn
 *   after_turn        → AgentHooks.afterTurn
 *   before_tool_call  → AgentHooks.beforeToolCall   (block on non-zero exit)
 *   after_tool_call   → AgentHooks.afterToolCall    (rewrite result on non-zero exit)
 *
 * Hooks receive a JSON payload on stdin; their stdout is captured but
 * only used for the after_tool_call rewrite path. Non-zero exit from
 * a `before_*` hook blocks the action with the hook's stdout/stderr
 * as the reason.
 *
 * Matchers: `before_tool_call` / `after_tool_call` accept an optional
 * `matcher` regex applied against the tool name. Hooks without a
 * matcher fire for every call.
 */
import type { AgentHooks } from "../kernel/types.js";
import type { DirghaConfig } from "../cli/config.js";
export declare function buildAgentHooksFromConfig(config: DirghaConfig): AgentHooks | undefined;
