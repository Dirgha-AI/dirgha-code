/**
 * `task` tool: lets the parent agent delegate a well-scoped sub-problem
 * to a fresh agent instance. Returns only the final text output so the
 * parent's context stays clean.
 */

import type { Tool, ToolContext } from './registry.js';
import type { ToolResult } from '../kernel/types.js';
import type { SubagentDelegator } from '../subagents/delegator.js';

interface Input {
  prompt: string;
  system?: string;
  toolAllowlist?: string[];
  maxTurns?: number;
  model?: string;
}

export function createTaskTool(delegator: SubagentDelegator): Tool {
  return {
    name: 'task',
    description: 'Delegate a sub-problem to a fresh agent with its own conversation, tool set, and budget. Returns only the sub-agent\'s final text answer.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The sub-agent\'s goal.' },
        system: { type: 'string', description: 'System prompt for the sub-agent (optional).' },
        toolAllowlist: { type: 'array', items: { type: 'string' }, description: 'Optional subset of tool names the sub-agent may use.' },
        maxTurns: { type: 'integer', minimum: 1, maximum: 24 },
        model: { type: 'string' },
      },
      required: ['prompt'],
    },
    async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const input = rawInput as Input;
      const result = await delegator.delegate(input);
      return {
        content: result.output || '(sub-agent produced no output)',
        isError: result.stopReason === 'error',
        metadata: {
          subSessionId: result.sessionId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          stopReason: result.stopReason,
        },
      };
    },
  };
}
