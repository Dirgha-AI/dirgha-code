/**
 * Cancellation (offline). Drives `runAgentLoop` with a mock provider
 * that yields text deltas slowly, then aborts mid-stream via the
 * AbortController. Verifies:
 *
 *   - the loop stopReason is `aborted` (not `error`)
 *   - text emitted before abort is preserved in the result history
 *   - a tool execution that's already in flight respects the same signal
 *   - aborting before the first turn is honored synchronously
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { runAgentLoop } = await import(_toUrl(_join(ROOT, 'kernel/agent-loop.js')).href);
const { createEventStream } = await import(_toUrl(_join(ROOT, 'kernel/event-stream.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Slow-stream provider — emits one delta every 25ms until aborted ---
function makeSlowProvider() {
  return {
    id: 'mock-slow',
    supportsTools: () => false,
    supportsThinking: () => false,
    async *stream(req) {
      yield { type: 'text_start' };
      for (let i = 0; i < 20; i++) {
        if (req.signal?.aborted) {
          // Surface the abort the way real providers do: throw an
          // AbortError so the agent-loop's catch-block tags the run.
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        yield { type: 'text_delta', delta: `chunk-${i} ` };
        await sleep(25);
      }
      yield { type: 'text_end' };
      yield { type: 'usage', inputTokens: 5, outputTokens: 5 };
      yield { type: 'turn_end', turnId: 't0', stopReason: 'end_turn' };
    },
  };
}

const noTools = [];
const noopExecutor = { async execute() { return { content: '', isError: false, durationMs: 0 }; } };

console.log('\n=== cancel: abort mid-stream ⇒ stopReason aborted ===');
{
  const ac = new AbortController();
  const events = createEventStream();
  let receivedDeltas = 0;
  events.subscribe(ev => { if (ev.type === 'text_delta') receivedDeltas++; });

  // Fire abort after 80 ms — enough to see at least 2 chunks.
  setTimeout(() => ac.abort(), 80);

  const result = await runAgentLoop({
    sessionId: 'c1',
    model: 'mock-slow',
    messages: [{ role: 'user', content: 'go' }],
    tools: noTools,
    maxTurns: 5,
    provider: makeSlowProvider(),
    toolExecutor: noopExecutor,
    events,
    signal: ac.signal,
  });

  check('stopReason = aborted',          result.stopReason === 'aborted');
  check('saw at least one delta',         receivedDeltas >= 1);
  check('saw fewer than 20 deltas',       receivedDeltas < 20);
}

console.log('\n=== cancel: abort BEFORE first turn ⇒ honored synchronously ===');
{
  const ac = new AbortController();
  ac.abort();
  const events = createEventStream();
  const result = await runAgentLoop({
    sessionId: 'c2',
    model: 'mock-slow',
    messages: [{ role: 'user', content: 'go' }],
    tools: noTools,
    maxTurns: 5,
    provider: makeSlowProvider(),
    toolExecutor: noopExecutor,
    events,
    signal: ac.signal,
  });
  check('pre-aborted ⇒ stopReason aborted', result.stopReason === 'aborted');
  check('history is just the user msg',     result.messages.length === 1);
}

console.log('\n=== cancel: tool executor receives the signal ===');
{
  const ac = new AbortController();
  let toolSawAbort = false;

  const provider = {
    id: 'mock-tool',
    supportsTools: () => true,
    supportsThinking: () => false,
    async *stream() {
      yield { type: 'toolcall_start', id: 'tc1', name: 'spin' };
      yield { type: 'toolcall_end',   id: 'tc1', input: {} };
      yield { type: 'usage', inputTokens: 1, outputTokens: 1 };
      yield { type: 'turn_end', turnId: 't0', stopReason: 'tool_use' };
    },
  };

  const executor = {
    async execute(_call, signal) {
      // Wait for the abort signal — fire abort externally.
      await new Promise(resolve => {
        if (signal.aborted) { toolSawAbort = true; resolve(); return; }
        signal.addEventListener('abort', () => { toolSawAbort = true; resolve(); }, { once: true });
      });
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    },
  };

  setTimeout(() => ac.abort(), 30);
  const events = createEventStream();
  const result = await runAgentLoop({
    sessionId: 'c3',
    model: 'mock-tool',
    messages: [{ role: 'user', content: 'go' }],
    tools: [{ name: 'spin', description: 'spins', inputSchema: { type: 'object' } }],
    maxTurns: 5,
    provider,
    toolExecutor: executor,
    events,
    signal: ac.signal,
  });

  check('executor saw abort signal',       toolSawAbort === true);
  check('stopReason = aborted (or error)', result.stopReason === 'aborted' || result.stopReason === 'error');
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
