/**
 * /spawn <prompt> — dispatch an in-process sub-agent via SubagentDelegator.
 *
 * Uses the current provider and model from SlashContext. Because SlashContext
 * does not expose a ToolRegistry or cwd, tools are disabled (toolAllowlist: [])
 * so the sub-agent runs as a pure LLM reasoning step with no file-system access.
 * Use `dirgha fleet` when you need a full tool-capable agent.
 */
import type { SlashCommand } from "./types.js";
export declare const spawnCommand: SlashCommand;
