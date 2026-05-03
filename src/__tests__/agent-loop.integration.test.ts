/**
 * Integration tests for runAgentLoop using deterministic mock fixtures.
 *
 * No real API calls are made. The MockProvider implements Provider directly,
 * yielding scripted AgentEvents. Tests cover:
 *   A. Plain text response, no tools
 *   B. Mode=plan blocks fs_write tool call
 *   C. Throwing beforeToolCall hook returns error result, loop does not throw
 *   D. composeHooks — replaceInput propagates from hookA to hookB
 *   E. Multi-turn — tool_use then text response
 *   F. AbortController aborts the loop early
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runAgentLoop } from '../kernel/agent-loop.js';
import { createEventStream } from '../kernel/event-stream.js';
import { enforceMode, composeHooks } from '../context/mode-enforcement.js';
import type { AgentEvent, AgentHooks, ToolCall } from '../kernel/types.js';
import { MockProvider } from './fixtures/mock-provider.js';
import { MockToolExecutor } from './fixtures/mock-executor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession() {
  return {
    sessionId: randomUUID(),
    model: 'mock-model',
    messages: [{ role: 'user' as const, content: 'test prompt' }],
    tools: [],
    maxTurns: 10,
    events: createEventStream(),
  };
}

function collectEvents(events: ReturnType<typeof createEventStream>): AgentEvent[] {
  const collected: AgentEvent[] = [];
  events.subscribe((ev) => { collected.push(ev); });
  return collected;
}

function extractText(messages: ReturnType<typeof makeSession>['messages']): string {
  const last = messages[messages.length - 1];
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  const parts = last.content as Array<{ type: string; text?: string }>;
  return parts
    .filter((p: { type: string }) => p.type === 'text')
    .map((p: { type: string; text?: string }) => p.text ?? '')
    .join('');
}

// ---------------------------------------------------------------------------
// Test A: plain text response, no tools
// ---------------------------------------------------------------------------

describe('Test A: plain text response, no tools', () => {
  it('returns assistant message with the scripted text content', async () => {
    const provider = new MockProvider([
      { type: 'text', content: 'Hello from mock' },
    ]);
    const executor = new MockToolExecutor();
    const session = makeSession();
    collectEvents(session.events);

    const result = await runAgentLoop({
      ...session,
      provider,
      toolExecutor: executor,
    });

    expect(result.stopReason).toBe('end_turn');
    expect(result.turnCount).toBe(1);

    const assistantMessages = result.messages.filter(
      (m) => m.role === 'assistant',
    );
    expect(assistantMessages.length).toBeGreaterThan(0);

    const text = extractText(assistantMessages as typeof session.messages);
    expect(text).toBe('Hello from mock');
    // No tool executor calls for a text-only response.
    expect(executor.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test B: mode=plan blocks fs_write tool call
// ---------------------------------------------------------------------------

describe('Test B: mode=plan blocks fs_write tool call', () => {
  it('blocks fs_write and records isError:true without calling the executor', async () => {
    const provider = new MockProvider([
      {
        type: 'tool_use',
        name: 'fs_write',
        input: { path: '/tmp/x', content: 'y' },
      },
      // second turn: text to end the loop
      { type: 'text', content: 'blocked and done' },
    ]);
    const executor = new MockToolExecutor({ fs_write: 'wrote file' });
    const session = makeSession();
    const collected = collectEvents(session.events);

    const modeHooks = enforceMode('plan');

    const result = await runAgentLoop({
      ...session,
      provider,
      toolExecutor: executor,
      hooks: modeHooks,
    });

    // fs_write must not have been called on the real executor.
    expect(executor.callCountFor('fs_write')).toBe(0);

    // The tool_exec_end event for fs_write must have isError: true.
    const execEndEvents = collected.filter(
      (ev): ev is Extract<AgentEvent, { type: 'tool_exec_end' }> =>
        ev.type === 'tool_exec_end',
    );

    // When a hook blocks, the loop returns early from executeToolCalls without
    // ever calling executor or emitting tool_exec_end. Verify via result
    // messages instead: the tool result part must carry isError.
    const toolResultMessages = result.messages.filter(
      (m) => m.role === 'user',
    );
    const hasErrorResult = toolResultMessages.some((m) => {
      if (typeof m.content === 'string') return false;
      return m.content.some(
        (p) => p.type === 'tool_result' && (p as { isError?: boolean }).isError === true,
      );
    });
    expect(hasErrorResult).toBe(true);

    // Even if tool_exec_end is emitted (depending on implementation path),
    // any that exist for fs_write should be errors.
    const fsWriteEnd = execEndEvents.filter(
      (ev) => (ev as unknown as { name?: string }).name === 'fs_write',
    );
    for (const ev of fsWriteEnd) {
      expect(ev.isError).toBe(true);
    }

    expect(result.stopReason).not.toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Test C: throwing beforeToolCall hook — loop doesn't throw, result isError
// ---------------------------------------------------------------------------

describe('Test C: throwing beforeToolCall hook', () => {
  it('returns isError:true result and does not throw from runAgentLoop', async () => {
    const provider = new MockProvider([
      { type: 'tool_use', name: 'shell', input: { cmd: 'ls' } },
      { type: 'text', content: 'recovered' },
    ]);
    const executor = new MockToolExecutor({ shell: 'file1' });
    const session = makeSession();
    collectEvents(session.events);

    const explodingHooks: AgentHooks = {
      beforeToolCall: async (_call: ToolCall) => {
        throw new Error('hook exploded');
      },
    };

    // Must NOT throw.
    const result = await runAgentLoop({
      ...session,
      provider,
      toolExecutor: executor,
      hooks: explodingHooks,
    });

    expect(result.stopReason).not.toBe('error');

    // shell must not have been called (hook threw before executor).
    expect(executor.callCountFor('shell')).toBe(0);

    // The tool result in the history should have isError: true and contain
    // the hook error message.
    const toolResultMessages = result.messages.filter(
      (m) => m.role === 'user',
    );
    let foundError = false;
    for (const m of toolResultMessages) {
      if (typeof m.content === 'string') continue;
      for (const p of m.content) {
        if (
          p.type === 'tool_result' &&
          (p as { isError?: boolean }).isError === true
        ) {
          const content = (p as { content: string }).content;
          expect(
            content.includes('hook exploded') || content.includes('Hook error'),
          ).toBe(true);
          foundError = true;
        }
      }
    }
    expect(foundError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test D: composeHooks — replaceInput propagates from hookA to hookB
// ---------------------------------------------------------------------------

describe('Test D: composeHooks — replaceInput propagates', () => {
  it('hookB receives the patched input from hookA', async () => {
    const provider = new MockProvider([
      { type: 'tool_use', name: 'shell', input: { cmd: 'original' } },
      { type: 'text', content: 'done' },
    ]);
    const executor = new MockToolExecutor({ shell: 'ok' });
    const session = makeSession();
    collectEvents(session.events);

    let inputSeenByHookB: unknown = null;

    const hookA: AgentHooks = {
      beforeToolCall: async (_call: ToolCall) => {
        return { block: false, replaceInput: { patched: true } };
      },
    };

    const hookB: AgentHooks = {
      beforeToolCall: async (call: ToolCall) => {
        inputSeenByHookB = call.input;
        return undefined;
      },
    };

    const composed = composeHooks(hookA, hookB);

    const result = await runAgentLoop({
      ...session,
      provider,
      toolExecutor: executor,
      hooks: composed,
    });

    expect(result.stopReason).not.toBe('error');
    // hookB must have seen the replaced input.
    expect(inputSeenByHookB).toEqual({ patched: true });
  });
});

// ---------------------------------------------------------------------------
// Test E: multi-turn — tool_use then text response
// ---------------------------------------------------------------------------

describe('Test E: multi-turn — tool_use then text', () => {
  it('final messages contain tool result and the follow-up text', async () => {
    const provider = new MockProvider([
      { type: 'tool_use', name: 'shell', input: { cmd: 'ls' } },
      { type: 'text', content: 'Done.' },
    ]);
    const executor = new MockToolExecutor({ shell: 'file1\nfile2' });
    const session = makeSession();
    collectEvents(session.events);

    const result = await runAgentLoop({
      ...session,
      provider,
      toolExecutor: executor,
    });

    expect(result.stopReason).toBe('end_turn');
    expect(result.turnCount).toBe(2);

    // Verify the shell executor was called.
    expect(executor.callCountFor('shell')).toBe(1);

    // The tool result 'file1\nfile2' must appear in a user message.
    const hasToolResult = result.messages.some(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        m.content.some(
          (p) =>
            p.type === 'tool_result' &&
            (p as { content: string }).content === 'file1\nfile2',
        ),
    );
    expect(hasToolResult).toBe(true);

    // The final assistant message must contain 'Done.'.
    const finalAssistant = result.messages.filter((m) => m.role === 'assistant').pop();
    expect(finalAssistant).toBeDefined();
    const finalText = extractText(
      [finalAssistant!] as typeof session.messages,
    );
    expect(finalText).toBe('Done.');
  });
});

// ---------------------------------------------------------------------------
// Test F: AbortController aborts the loop early
// ---------------------------------------------------------------------------

describe('Test F: AbortController aborts the loop', () => {
  it('returns aborted stop reason and no events fire after abort', async () => {
    // Each character of content takes 20ms; total would be 400ms+.
    // We abort after 50ms — only the first ~2 chars would stream.
    const content = 'streaming long response that takes a while to complete';
    const provider = new MockProvider([
      { type: 'text', content, delayMs: 20 },
    ]);
    const executor = new MockToolExecutor();
    const session = makeSession();
    const collected = collectEvents(session.events);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    const result = await runAgentLoop({
      ...session,
      provider,
      toolExecutor: executor,
      signal: controller.signal,
    });

    expect(result.stopReason).toBe('aborted');

    // Snapshot the collected events at this point.
    const eventCountAtAbort = collected.length;

    // Wait a bit to ensure no more events are fired after abort.
    await new Promise((r) => setTimeout(r, 100));
    expect(collected.length).toBe(eventCountAtAbort);

    // agent_end must have been emitted (the finally block always runs).
    const agentEndEvent = collected.find((ev) => ev.type === 'agent_end');
    expect(agentEndEvent).toBeDefined();
    if (agentEndEvent && agentEndEvent.type === 'agent_end') {
      expect(agentEndEvent.stopReason).toBe('aborted');
    }
  });
});
