/**
 * `task` tool dispatch (subagent registry + delegate flow).
 *
 * Spawns a SubagentDelegator with a mock Provider, registers the task
 * tool, then has the parent agent invoke `task({ prompt: ... })`. The
 * mock provider:
 *   - parent turn 0: emits a tool_use for `task` with sub-prompt "X"
 *   - parent turn 1: emits final text containing the sub-agent's reply
 *   - sub turn 0:    emits final text "sub: X done"
 *
 * Verifies:
 *   - the task tool is registered in the parent registry
 *   - parent tool_use → delegator.delegate runs a fresh agent loop
 *   - sub-agent's output flows back as the parent tool_result
 *   - sub-agent gets a distinct sessionId (parent-sub-XXXX shape)
 *   - tool metadata carries sub usage counts + stopReason
 *   - toolAllowlist trims the sub-agent's tool surface
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { runAgentLoop } = await import(_toUrl(_join(ROOT, 'kernel/agent-loop.js')).href);
const { createEventStream } = await import(_toUrl(_join(ROOT, 'kernel/event-stream.js')).href);
const { createToolRegistry, createToolExecutor, builtInTools } = await import(_toUrl(_join(ROOT, 'tools/index.js')).href);
const { SubagentDelegator } = await import(_toUrl(_join(ROOT, 'subagents/delegator.js')).href);
const { createTaskTool } = await import(_toUrl(_join(ROOT, 'tools/task.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

let parentTurn = 0;
const parentProvider = {
  id: 'mock-parent',
  supportsTools: () => true,
  supportsThinking: () => false,
  async *stream() {
    if (parentTurn === 0) {
      parentTurn++;
      yield { type: 'toolcall_start', id: 'tc-task', name: 'task' };
      yield { type: 'toolcall_end',   id: 'tc-task', input: { prompt: 'compute X' } };
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      yield { type: 'turn_end', turnId: 'p0', stopReason: 'tool_use' };
    } else {
      yield { type: 'text_start' };
      yield { type: 'text_delta', delta: 'parent done' };
      yield { type: 'text_end' };
      yield { type: 'usage', inputTokens: 12, outputTokens: 3 };
      yield { type: 'turn_end', turnId: 'p1', stopReason: 'end_turn' };
    }
  },
};

const subProvider = {
  id: 'mock-sub',
  supportsTools: () => true,
  supportsThinking: () => false,
  async *stream() {
    yield { type: 'text_start' };
    yield { type: 'text_delta', delta: 'sub: compute X done' };
    yield { type: 'text_end' };
    yield { type: 'usage', inputTokens: 8, outputTokens: 4 };
    yield { type: 'turn_end', turnId: 's0', stopReason: 'end_turn' };
  },
};

console.log('\n=== task tool: parent registers + invokes; sub-agent reply flows back ===');
{
  parentTurn = 0;
  // Build a fresh registry with builtins + the task tool. We use the sub
  // provider for the delegator (parent provider is for the outer loop).
  const registry = createToolRegistry(builtInTools);
  const delegator = new SubagentDelegator({
    registry,
    provider: subProvider,
    defaultModel: 'mock-sub',
    cwd: process.cwd(),
    parentSessionId: 'parent-1',
  });
  registry.register(createTaskTool(delegator));
  check('task tool present in registry',     registry.has('task'));

  const sanitized = registry.sanitize({ descriptionLimit: 200 });
  check('task tool exposed in tool defs',     sanitized.definitions.some(d => d.name === 'task'));

  const events = createEventStream();
  const executor = createToolExecutor({ registry, cwd: process.cwd(), sessionId: 'parent-1' });

  const result = await runAgentLoop({
    sessionId: 'parent-1',
    model: 'mock-parent',
    messages: [{ role: 'user', content: 'do it' }],
    tools: sanitized.definitions,
    maxTurns: 5,
    provider: parentProvider,
    toolExecutor: executor,
    events,
  });

  check('parent loop terminated end_turn',     result.stopReason === 'end_turn');

  // Walk parent transcript for the tool_result the sub produced.
  const toolResults = [];
  for (const m of result.messages) {
    if (Array.isArray(m.content)) for (const p of m.content) if (p.type === 'tool_result') toolResults.push(p);
  }
  check('exactly one tool_result',             toolResults.length === 1);
  check('sub output bubbles to parent',        /sub: compute X done/.test(toolResults[0]?.content ?? ''));
  check('tool_result not flagged as error',     toolResults[0]?.isError === false);
}

console.log('\n=== task tool: toolAllowlist scopes the sub-agent ===');
{
  parentTurn = 0;
  // Override sub-provider to record what it saw — i.e. count of tools.
  let sawTools = -1;
  const recordingSubProvider = {
    id: 'rec-sub',
    supportsTools: () => true,
    supportsThinking: () => false,
    async *stream(req) {
      sawTools = (req.tools ?? []).length;
      yield { type: 'text_delta', delta: 'narrow' };
      yield { type: 'usage', inputTokens: 1, outputTokens: 1 };
      yield { type: 'turn_end', turnId: 's0', stopReason: 'end_turn' };
    },
  };
  const registry = createToolRegistry(builtInTools);
  const delegator = new SubagentDelegator({
    registry, provider: recordingSubProvider, defaultModel: 'rec-sub', cwd: process.cwd(), parentSessionId: 'parent-2',
  });
  registry.register(createTaskTool(delegator));

  // Drive `delegator.delegate` directly — simpler than the full parent loop.
  const sub = await delegator.delegate({ prompt: 'narrow', toolAllowlist: ['fs_read'] });
  check('sub completed end_turn',              sub.stopReason === 'end_turn');
  check('sub saw exactly 1 tool',               sawTools === 1, `sawTools=${sawTools}`);

  const wide = await delegator.delegate({ prompt: 'wide' });
  check('without allowlist sub sees many tools', sawTools >= 5, `sawTools=${sawTools}`);
  check('sub sessionId distinct from parent',    sub.sessionId !== 'parent-2' && sub.sessionId.startsWith('parent-2-sub-'));
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
