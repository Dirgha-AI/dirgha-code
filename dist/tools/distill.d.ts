/**
 * Tool output distillation. Tool results whose content exceeds the
 * configured budget are truncated to a head + tail with a marker line
 * describing the omitted middle. The FULL content is saved to disk
 * under ~/.dirgha/tool-outputs/{callId}.txt so the user can inspect
 * it after the fact.
 *
 * Distillation runs inside the executor AFTER wrapLegacyResult, so it
 * always operates on a canonical v2 ToolResult.
 *
 * Configuration is via env vars so we don't have to thread a config
 * object through the executor for now:
 *   DIRGHA_TOOL_DISTILL_MAX_CHARS   default 20000
 *   DIRGHA_TOOL_DISTILL_HEAD_CHARS  default 6000
 *   DIRGHA_TOOL_DISTILL_TAIL_CHARS  default 2000
 *   DIRGHA_TOOL_DISTILL_DISABLE     set to '1' to skip distillation entirely
 *   DIRGHA_TOOL_OUTPUTS_DIR         default ~/.dirgha/tool-outputs
 */
import type { ToolResult } from '../kernel/types.js';
/**
 * Distill a tool result in place. Returns the same result object,
 * with content potentially truncated. The full content is saved
 * to disk on truncation.
 *
 * Skips distillation when DIRGHA_TOOL_DISTILL_DISABLE=1.
 */
export declare function distillToolResult(result: ToolResult, callId?: string): ToolResult;
