/**
 * fleet/scratchpad-tools.ts — fleet_note and fleet_read tools.
 *
 * These are injected by runner.ts into each fleet agent's ToolRegistry.
 * They are NOT in builtInTools — they only exist inside fleet runs.
 *
 * The ScratchpadHandle and agentId are bound via createScratchpadTools()
 * at agent-spawn time; the tool's execute() accesses them from closure.
 */
import type { Tool } from "../tools/registry.js";
import { type ScratchpadEntry, type ScratchpadHandle } from "./scratchpad.js";
export type { ScratchpadEntry };
export declare function createScratchpadTools(handle: ScratchpadHandle, agentId: string): [Tool, Tool];
