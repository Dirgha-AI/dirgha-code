/**
 * `task` tool: lets the parent agent delegate a well-scoped sub-problem
 * to a fresh agent instance. Returns only the final text output so the
 * parent's context stays clean.
 */
export function createTaskTool(delegator) {
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
        async execute(rawInput, _ctx) {
            const input = rawInput;
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
//# sourceMappingURL=task.js.map