/**
 * task-manager.ts — Persistent task/todo tools for the agent.
 *
 * The agent can create, update, list, and delete tasks. Each task has
 * a title, status (pending/in_progress/done/blocked/cancelled), progress
 * percentage, priority, project, and tags. Stored in ~/.dirgha/tasks.json.
 *
 * The TUI's TaskIndicator reads the same file so the user sees live status.
 */
import type { Tool } from "./registry.js";
export declare const taskCreateTool: Tool;
export declare const taskUpdateTool: Tool;
export declare const taskListTool: Tool;
export declare const taskDeleteTool: Tool;
export declare const taskSummaryTool: Tool;
