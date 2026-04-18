/**
 * agent/executor.ts — Headless command executor for agent mode.
 * Runs commands without TUI, returns structured AgentOutput.
 */
import type { AgentOutput, AgentInput } from './types.js';

/** Execute command in headless agent mode. */
export async function executeAgentMode(
  input: AgentInput,
  handlers: Record<string, (args: unknown, flags: unknown) => Promise<AgentOutput>>
): Promise<AgentOutput> {
  const start = Date.now();
  
  try {
    const handler = handlers[input.command];
    if (!handler) {
      return {
        text: `Unknown command: ${input.command}`,
        exitCode: 1,
        command: input.command,
        timestamp: new Date().toISOString(),
        suggestions: ['Use --help to list available commands']
      };
    }

    const result = await handler(input.args, input.flags);
    result.meta = { ...result.meta, durationMs: Date.now() - start };
    return result;
  } catch (err) {
    return {
      text: err instanceof Error ? err.message : 'Unknown error',
      exitCode: 1,
      command: input.command,
      timestamp: new Date().toISOString(),
      suggestions: ['Check arguments and try again']
    };
  }
}

/** Format output for agent consumption. */
export function formatAgentOutput(output: AgentOutput, format: 'json' | 'text'): string {
  if (format === 'json') {
    return JSON.stringify(output, null, 2);
  }
  // Human-readable format
  let text = output.text;
  if (output.data) {
    text += '\n\n[Data]\n' + JSON.stringify(output.data, null, 2);
  }
  if (output.suggestions?.length) {
    text += '\n\nSuggestions:\n' + output.suggestions.map(s => `  • ${s}`).join('\n');
  }
  return text;
}
