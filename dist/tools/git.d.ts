/**
 * Git introspection tool. Read-mostly: status, diff, log, branch, show.
 * Destructive operations (commit, push, reset) are deliberately out of
 * scope — the agent performs those via the shell tool so the user sees
 * a single "exec this command?" prompt per operation.
 */
import type { Tool } from "./registry.js";
export declare const gitTool: Tool;
