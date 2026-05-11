/**
 * goal.ts — Persistent goal tools for the agent.
 *
 * The agent can read and update the user's persistent goal.
 * Stored in ~/.dirgha/goal.json.
 */
import type { Tool } from "./registry.js";
export declare const goalGetTool: Tool;
export declare const goalSetTool: Tool;
export declare const goalProgressTool: Tool;
export declare const goalCompleteTool: Tool;
