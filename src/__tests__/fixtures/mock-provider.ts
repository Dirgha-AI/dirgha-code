/**
 * Deterministic mock provider for agent-loop integration tests.
 *
 * Implements the Provider interface from kernel/types. Each ScriptStep
 * describes exactly one model response turn: either a text response or a
 * single tool_use call. The provider yields the corresponding AgentEvents
 * and then signals end_turn. Steps are consumed in order; when the script
 * is exhausted every subsequent call yields an empty turn (text_start /
 * text_end with no delta).
 */

import type {
  Provider,
  StreamRequest,
  AgentEvent,
} from '../../kernel/types.js';

export type ScriptStep =
  | { type: 'text'; content: string; delayMs?: number }
  | { type: 'tool_use'; name: string; input: Record<string, unknown>; id?: string };

let _idCounter = 0;
function nextId(): string {
  return `mock-tool-${++_idCounter}`;
}

export class MockProvider implements Provider {
  readonly id = 'mock';
  private script: ScriptStep[];
  private cursor = 0;

  constructor(script: ScriptStep[]) {
    this.script = script;
  }

  reset(): void {
    this.cursor = 0;
  }

  supportsTools(_modelId: string): boolean {
    return true;
  }

  supportsThinking(_modelId: string): boolean {
    return false;
  }

  async *stream(req: StreamRequest): AsyncIterable<AgentEvent> {
    const signal = req.signal;
    const step = this.script[this.cursor];
    if (step !== undefined) {
      this.cursor++;
    }

    if (!step || step.type === 'text') {
      const content = step?.type === 'text' ? step.content : '';
      const delayMs = step?.type === 'text' ? (step.delayMs ?? 0) : 0;

      yield { type: 'text_start' };

      if (delayMs > 0) {
        // Yield one character at a time with delay so AbortSignal tests work.
        for (const ch of content) {
          if (signal?.aborted) return;
          yield { type: 'text_delta', delta: ch };
          await delay(delayMs);
        }
      } else {
        if (content.length > 0) {
          yield { type: 'text_delta', delta: content };
        }
      }

      if (!signal?.aborted) {
        yield { type: 'text_end' };
        yield {
          type: 'usage',
          inputTokens: 1,
          outputTokens: content.length > 0 ? 1 : 0,
        };
      }
    } else {
      // tool_use step
      const id = step.id ?? nextId();
      const inputJson = JSON.stringify(step.input);

      yield { type: 'toolcall_start', id, name: step.name };
      yield { type: 'toolcall_delta', id, deltaJson: inputJson };
      yield { type: 'toolcall_end', id, input: step.input };
      yield {
        type: 'usage',
        inputTokens: 1,
        outputTokens: 1,
      };
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
