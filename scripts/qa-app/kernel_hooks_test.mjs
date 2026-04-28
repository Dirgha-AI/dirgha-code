/**
 * Kernel hooks lifecycle (offline). Drives `runAgentLoop` with a mock
 * Provider + mock ToolExecutor so the test never touches the network.
 *
 * Verifies:
 *   - beforeTurn fires once per turn (turn 0 then turn 1)
 *   - beforeToolCall sees the call and can `block: true` to veto it,
 *     turning the next turn's tool_result into an error string
 *   - afterToolCall can rewrite the result content
 *   - afterTurn fires with the running usage total
 *   - the agent_end stopReason is `end_turn` after the assistant's
 *     final text turn
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { runAgentLoop } = await import(_toUrl(_join(ROOT, 'kernel/agent-loop.js')).href);
const { createEventStream } = await import(_toUrl(_join(ROOT, 'kernel/event-stream.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

// --- mock provider: turn 0 emits a tool_use; turn 1 emits a final text. ---

let turnCount = 0;
const mockProvider = {
  id: 'mock',
  supportsTools: () => true,
  supportsThinking: () => false,
  async *stream() {
    if (turnCount === 0) {
      turnCount++;
      yield { type: 'toolcall_start', id: 'tc-1', name: 'echo' };
      yield { type: 'toolcall_delta', id: 'tc-1', deltaJson: '{"text":"hi"}' };
      yield { type: 'toolcall_end',   id: 'tc-1', input: { text: 'hi' } };
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      yield { type: 'turn_end', turnId: 't0', stopReason: 'tool_use' };
    } else {
      yield { type: 'text_start' };
      yield { type: 'text_delta', delta: 'final answer' };
      yield { type: 'text_end' };
      yield { type: 'usage', inputTokens: 12, outputTokens: 4 };
      yield { type: 'turn_end', turnId: 't1', stopReason: 'end_turn' };
    }
  },
};

// --- mock tool executor: returns a stable text payload ---

const mockExecutor = {
  async execute(call) {
    return { content: `echoed: ${call.input?.text ?? ''}`, isError: false, durationMs: 1 };
  },
};

const tools = [{ name: 'echo', description: 'echoes its input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }];

// --- happy path: hooks fire, results pass through ---

console.log('\n=== kernel hooks: happy path (no veto, no rewrite) ===');
{
  turnCount = 0;
  const calls = { beforeTurn: 0, beforeToolCall: 0, afterToolCall: 0, afterTurn: 0 };
  let observedUsage = null;
  const events = createEventStream();
  const result = await runAgentLoop({
    sessionId: 'h1',
    model: 'mock-model',
    messages: [{ role: 'user', content: 'go' }],
    tools,
    maxTurns: 5,
    provider: mockProvider,
    toolExecutor: mockExecutor,
    events,
    hooks: {
      async beforeTurn() { calls.beforeTurn++; return 'continue'; },
      async beforeToolCall(call) { calls.beforeToolCall++; check('beforeToolCall sees echo call', call.name === 'echo'); return undefined; },
      async afterToolCall(_call, r) { calls.afterToolCall++; return r; },
      async afterTurn(_idx, usage) { calls.afterTurn++; observedUsage = usage; },
    },
  });
  check('two turns ran',                 calls.beforeTurn === 2, `got ${calls.beforeTurn}`);
  check('one tool call inspected',        calls.beforeToolCall === 1);
  check('afterToolCall fired once',       calls.afterToolCall === 1);
  check('afterTurn fired twice',          calls.afterTurn === 2);
  check('final stopReason = end_turn',    result.stopReason === 'end_turn');
  check('afterTurn saw running usage',    observedUsage && observedUsage.inputTokens > 0);
}

// --- veto path: beforeToolCall blocks, error becomes the tool_result ---

console.log('\n=== kernel hooks: beforeToolCall veto produces an error tool_result ===');
{
  turnCount = 0;
  let blockedCall = null;
  const events = createEventStream();
  const result = await runAgentLoop({
    sessionId: 'h2',
    model: 'mock-model',
    messages: [{ role: 'user', content: 'go' }],
    tools,
    maxTurns: 5,
    provider: mockProvider,
    toolExecutor: mockExecutor,
    events,
    hooks: {
      async beforeToolCall(call) { blockedCall = call.name; return { block: true, reason: 'no echoing today' }; },
    },
  });
  check('veto handler saw the call',      blockedCall === 'echo');
  check('agent loop still terminated',    result.stopReason === 'end_turn');
  // Find the synthetic tool_result that the veto produced
  const toolResults = [];
  for (const m of result.messages) {
    if (Array.isArray(m.content)) for (const p of m.content) if (p.type === 'tool_result') toolResults.push(p);
  }
  check('one synthetic tool_result',      toolResults.length === 1);
  check('result is marked error',         toolResults[0]?.isError === true);
  check('reason is in the content',       /no echoing today/.test(toolResults[0]?.content ?? ''));
}

// --- rewrite path: afterToolCall mutates the result content ---

console.log('\n=== kernel hooks: afterToolCall rewrite swaps the content ===');
{
  turnCount = 0;
  const events = createEventStream();
  const result = await runAgentLoop({
    sessionId: 'h3',
    model: 'mock-model',
    messages: [{ role: 'user', content: 'go' }],
    tools,
    maxTurns: 5,
    provider: mockProvider,
    toolExecutor: mockExecutor,
    events,
    hooks: {
      async afterToolCall(_call, r) { return { ...r, content: 'REWRITTEN' }; },
    },
  });
  const toolResults = [];
  for (const m of result.messages) {
    if (Array.isArray(m.content)) for (const p of m.content) if (p.type === 'tool_result') toolResults.push(p);
  }
  check('rewrite was applied',            toolResults[0]?.content === 'REWRITTEN');
  check('isError stays false',            toolResults[0]?.isError === false);
}

// --- abort path: beforeTurn returns 'abort' on turn 0 ---

console.log('\n=== kernel hooks: beforeTurn=abort terminates the loop ===');
{
  turnCount = 0;
  let beforeTurnCalls = 0;
  const events = createEventStream();
  const result = await runAgentLoop({
    sessionId: 'h4',
    model: 'mock-model',
    messages: [{ role: 'user', content: 'go' }],
    tools,
    maxTurns: 5,
    provider: mockProvider,
    toolExecutor: mockExecutor,
    events,
    hooks: {
      async beforeTurn() { beforeTurnCalls++; return 'abort'; },
    },
  });
  check('beforeTurn fired exactly once',   beforeTurnCalls === 1);
  check('result has user-only history',    result.messages.length === 1);
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
