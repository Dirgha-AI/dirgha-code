/**
 * Deterministic mock tool executor for agent-loop integration tests.
 *
 * Returns preset string results keyed by tool name. If the tool name is
 * not in the map the executor returns the default fallback ('mock result').
 * Tracks call counts so tests can assert which tools were (or were not)
 * invoked.
 */

import type { ToolCall, ToolResult, ToolExecutor } from '../../kernel/types.js';

export class MockToolExecutor implements ToolExecutor {
  private results: Record<string, string>;
  private _calls: ToolCall[] = [];

  constructor(results: Record<string, string> = {}) {
    this.results = results;
  }

  get calls(): ToolCall[] {
    return [...this._calls];
  }

  callCountFor(toolName: string): number {
    return this._calls.filter((c) => c.name === toolName).length;
  }

  reset(): void {
    this._calls = [];
  }

  async execute(call: ToolCall, _signal: AbortSignal): Promise<ToolResult> {
    this._calls.push(call);
    const content = this.results[call.name] ?? 'mock result';
    return { content, isError: false };
  }
}
