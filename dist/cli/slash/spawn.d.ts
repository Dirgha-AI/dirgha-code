/**
 * /spawn <prompt> — dispatch an in-process sub-agent via SubagentDelegator.
 *
 * Uses the current provider and model from SlashContext. SlashContext does not
 * expose a ToolRegistry, so we build a minimal read-only registry directly
 * from builtInTools filtered to a safe read-only subset. This gives the
 * sub-agent file-read and search capability needed for coding tasks without
 * exposing write/shell/network tools.
 *
 * Use `dirgha fleet` when you need a full write-capable agent.
 */
import type { SlashCommand } from "./types.js";
export declare const spawnCommand: SlashCommand;
