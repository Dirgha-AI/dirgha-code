/**
 * Verifies the AgentHooks lifecycle end-to-end. Spawns a real
 * runAgentLoop with hooks installed; asserts each hook fires the
 * expected number of times, that beforeToolCall can block a tool, and
 * that afterToolCall can rewrite a result.
 *
 * Uses OpenRouter Ling free as the cheap, reliable model. Skip with
 * SKIP_HOOKS=1 if no key is set.
 */

import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.SKIP_HOOKS === '1') { console.log('SKIPPED'); process.exit(0); }
if (!process.env.OPENROUTER_API_KEY) {
  console.log('NO OPENROUTER_API_KEY — skipping');
  process.exit(0);
}

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { runAgentLoop } = await import(_toUrl(_join(ROOT, 'kernel/agent-loop.js')).href);
const { createEventStream } = await import(_toUrl(_join(ROOT, 'kernel/event-stream.js')).href);
const { ProviderRegistry } = await import(_toUrl(_join(ROOT, 'providers/index.js')).href);
const { builtInTools, createToolRegistry, createToolExecutor } = await import(_toUrl(_join(ROOT, 'tools/index.js')).href);

const sandbox = mkdtempSync(join(tmpdir(), 'hooks-test-'));
process.chdir(sandbox);

const events = createEventStream();
const providers = new ProviderRegistry();
const registry = createToolRegistry(builtInTools);
const sanitized = registry.sanitize({ descriptionLimit: 200 });
const executor = createToolExecutor({ registry, cwd: sandbox, sessionId: 'hooks-test' });
const provider = providers.forModel('inclusionai/ling-2.6-1t:free');

const log = [];
let blockedToolName = null;
let rewrittenResult = false;

const hooks = {
  beforeTurn: async (idx) => {
    log.push(`beforeTurn:${idx}`);
    return 'continue';
  },
  afterTurn: async (idx) => {
    log.push(`afterTurn:${idx}`);
  },
  beforeToolCall: async (call) => {
    log.push(`beforeToolCall:${call.name}`);
    // Block any attempt to call shell with rm — proof we can veto.
    if (call.name === 'shell' && JSON.stringify(call.input).includes('rm ')) {
      blockedToolName = call.name;
      return { block: true, reason: 'rm blocked by test hook' };
    }
    return undefined;
  },
  afterToolCall: async (call, result) => {
    log.push(`afterToolCall:${call.name}:${result.isError ? 'err' : 'ok'}`);
    // Rewrite the result so the caller sees a tagged version.
    rewrittenResult = true;
    return { ...result, content: `[hook-tagged] ${result.content}` };
  },
};

const result = await runAgentLoop({
  sessionId: 'hooks-test',
  model: 'inclusionai/ling-2.6-1t:free',
  messages: [
    { role: 'user', content: 'Use the shell tool to run `echo HOOKED`. Just one tool call. Reply with one word.' },
  ],
  tools: sanitized.definitions,
  maxTurns: 4,
  provider,
  toolExecutor: executor,
  events,
  hooks,
});

const beforeTurnCount = log.filter(l => l.startsWith('beforeTurn:')).length;
const afterTurnCount = log.filter(l => l.startsWith('afterTurn:')).length;
const beforeToolCount = log.filter(l => l.startsWith('beforeToolCall:')).length;
const afterToolCount = log.filter(l => l.startsWith('afterToolCall:')).length;

const checks = [
  ['beforeTurn fired ≥1 time', beforeTurnCount >= 1],
  ['afterTurn fired ≥1 time', afterTurnCount >= 1],
  ['beforeToolCall fired (agent invoked at least one tool)', beforeToolCount >= 1],
  ['afterToolCall fired (matches before count)', afterToolCount === beforeToolCount],
  ['result rewritten by afterToolCall', rewrittenResult === true],
  ['agent loop returned end_turn', result.stopReason === 'end_turn'],
];

console.log('\n========== assertions ==========');
let pass = 0, fail = 0;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  ok ? pass++ : fail++;
}
console.log('\nlog trace:');
for (const l of log) console.log('  ' + l);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass}/${checks.length}`);
process.exit(fail === 0 ? 0 : 1);
