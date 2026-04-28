/**
 * `task` tool: lets the parent agent delegate a well-scoped sub-problem
 * to a fresh agent instance. Returns only the final text output so the
 * parent's context stays clean.
 */
import type { Tool } from './registry.js';
import type { SubagentDelegator } from '../subagents/delegator.js';
export declare function createTaskTool(delegator: SubagentDelegator): Tool;
