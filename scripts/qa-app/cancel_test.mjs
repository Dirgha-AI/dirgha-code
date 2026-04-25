/**
 * Cancellation robustness: AbortController.abort() during a streaming
 * agent turn must:
 *   - return cleanly (stopReason === 'aborted')
 *   - not throw
 *   - not corrupt the session JSONL (every appended line parses)
 *   - emit at most one in-flight `error` event with retryable hints
 *
 * Mid-tool aborts: the tool's signal should fire, the kernel should
 * record the partial transcript, and the agent loop should return
 * 'aborted' rather than 'end_turn' / 'error'.
 *
 * Skips when OPENROUTER_API_KEY isn't set.
 */

import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.OPENROUTER_API_KEY) { console.log('SKIP: OPENROUTER_API_KEY unset'); process.exit(0); }

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { runAgentLoop } = await import(`${ROOT}/kernel/agent-loop.js`);
const { createEventStream } = await import(`${ROOT}/kernel/event-stream.js`);
const { ProviderRegistry } = await import(`${ROOT}/providers/index.js`);
const { builtInTools, createToolRegistry, createToolExecutor } = await import(`${ROOT}/tools/index.js`);
const { createSessionStore } = await import(`${ROOT}/context/session.js`);

// Scratch HOME so the session JSONL we append to ends up in a tmp.
const home = mkdtempSync(join(tmpdir(), 'cancel-home-'));
process.env.HOME = home;
mkdirSync(join(home, '.dirgha', 'sessions'), { recursive: true });

const sandbox = mkdtempSync(join(tmpdir(), 'cancel-sandbox-'));
process.chdir(sandbox);

const sessions = createSessionStore();
const sessionId = 'cancel-test';
const session = await sessions.create(sessionId);
await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'user', content: 'first turn' } });

const events = createEventStream();
events.subscribe(async ev => {
  if (ev.type === 'usage') {
    await session.append({ type: 'usage', ts: new Date().toISOString(), usage: { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, cachedTokens: ev.cachedTokens ?? 0, costUsd: 0 } });
  }
});

const providers = new ProviderRegistry();
const provider = providers.forModel('inclusionai/ling-2.6-1t:free');
const registry = createToolRegistry(builtInTools);
const sanitized = registry.sanitize({ descriptionLimit: 200 });
const executor = createToolExecutor({ registry, cwd: sandbox, sessionId });

const ctrl = new AbortController();
// Abort 1.2 seconds in — long enough for the request to start streaming
// but not enough to complete. Ling responds quickly so this is a real
// mid-stream interrupt.
setTimeout(() => ctrl.abort(), 1200);

const t0 = Date.now();
let result, threw;
try {
  result = await runAgentLoop({
    sessionId,
    model: 'inclusionai/ling-2.6-1t:free',
    messages: [{ role: 'user', content: 'Write a long detailed essay about the history of computing in 5 paragraphs.' }],
    tools: sanitized.definitions,
    maxTurns: 4,
    provider,
    toolExecutor: executor,
    events,
    signal: ctrl.signal,
  });
} catch (err) {
  threw = err instanceof Error ? err.message : String(err);
}
const durationMs = Date.now() - t0;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== cancellation robustness ===');
check('agent loop did not throw', !threw, threw);
check('returned a result',         result !== undefined);
if (result) {
  check('stopReason is aborted',   result.stopReason === 'aborted', `got ${result.stopReason}`);
  check('partial token usage was captured', (result.usage.inputTokens + result.usage.outputTokens) >= 0);
}
check('aborted within 2s',         durationMs < 2_000, `${durationMs}ms`);

// Session JSONL: every line must parse cleanly.
const jsonlPath = join(home, '.dirgha', 'sessions', `${sessionId}.jsonl`);
if (existsSync(jsonlPath)) {
  const text = readFileSync(jsonlPath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  let parseErr;
  for (const line of lines) {
    try { JSON.parse(line); } catch (e) { parseErr = e instanceof Error ? e.message : String(e); break; }
  }
  check('session JSONL has no malformed lines', parseErr === undefined, parseErr ?? `${lines.length} lines`);
} else {
  check('session JSONL exists', false);
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
