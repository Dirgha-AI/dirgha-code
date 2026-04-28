/**
 * Compaction smoke. Proves:
 *   - maybeCompact under threshold returns history unchanged
 *   - maybeCompact above threshold replaces older turns with a synthetic
 *     summary user message and preserves the trailing window
 *   - compaction_before / compaction_after hooks fire with payloads
 *   - a compaction_before veto blocks the operation
 *
 * Uses a fake summarizer Provider that emits a deterministic stream so
 * the test is offline and 100% reproducible.
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { maybeCompact } = await import(_toUrl(_join(ROOT, 'context/compaction.js')).href);
const { createHookRegistry } = await import(_toUrl(_join(ROOT, 'hooks/registry.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

function fakeSummarizer(text) {
  return {
    name: 'fake',
    async *stream() {
      yield { type: 'text_delta', delta: text };
      yield { type: 'message_stop' };
    },
  };
}

function userTurn(text)      { return { role: 'user',      content: [{ type: 'text', text }] }; }
function assistantTurn(text) { return { role: 'assistant', content: [{ type: 'text', text }] }; }

// 12 turns of mixed content, with a system at the front.
const baseHistory = [
  { role: 'system', content: 'You are a coding agent.' },
];
for (let i = 0; i < 12; i++) {
  baseHistory.push(userTurn(`User question number ${i} with enough words to inflate token estimate ${'lorem '.repeat(20)}`));
  baseHistory.push(assistantTurn(`Assistant reply number ${i} ${'ipsum '.repeat(20)}`));
}

console.log('\n=== compaction: under threshold passes through ===');
const under = await maybeCompact(baseHistory, {
  triggerTokens: 1_000_000,
  preserveLastTurns: 4,
  summarizer: fakeSummarizer('UNUSED'),
  summaryModel: 'fake-model',
});
check('not compacted',         under.compacted === false);
check('history length intact', under.messages.length === baseHistory.length);

console.log('\n=== compaction: over threshold trims with summary ===');
const over = await maybeCompact(baseHistory, {
  triggerTokens: 50,
  preserveLastTurns: 2,
  summarizer: fakeSummarizer('SUMMARY-OK'),
  summaryModel: 'fake-model',
});
check('compacted=true',                   over.compacted === true);
check('summary contains expected token',  /SUMMARY-OK/.test(over.summary ?? ''));
check('tokensAfter < tokensBefore',       over.tokensAfter < over.tokensBefore);
check('first remains system',             over.messages[0].role === 'system');
const firstNonSystem = over.messages.find(m => m.role !== 'system');
const firstText = firstNonSystem?.content?.[0]?.text ?? '';
check('synthetic user summary present',   /\[Compacted summary of earlier turns\]/.test(firstText));
check('tail preserved (last user kept)',  over.messages.at(-2)?.role === 'user');

console.log('\n=== compaction: hooks fire with payloads ===');
const hooks1 = createHookRegistry();
const seen = { before: null, after: null };
hooks1.on('compaction_before', payload => { seen.before = payload; });
hooks1.on('compaction_after',  payload => { seen.after  = payload; });
const hooked = await maybeCompact(baseHistory, {
  triggerTokens: 50,
  preserveLastTurns: 2,
  summarizer: fakeSummarizer('HOOKED'),
  summaryModel: 'fake-model',
  hooks: hooks1,
});
check('compaction succeeded',                 hooked.compacted === true);
check('compaction_before fired',              seen.before !== null);
check('compaction_before payload has tokens', typeof seen.before?.tokensBefore === 'number' && seen.before.tokensBefore > 0);
check('compaction_after fired',               seen.after !== null);
check('compaction_after has summary',         /HOOKED/.test(seen.after?.summary ?? ''));
check('after.tokensAfter < tokensBefore',     seen.after?.tokensAfter < seen.after?.tokensBefore);

console.log('\n=== compaction: compaction_before veto blocks operation ===');
const hooks2 = createHookRegistry();
hooks2.on('compaction_before', () => ({ block: true, reason: 'no thanks' }));
let summarizerCalled = false;
const vetoSummarizer = {
  name: 'fake',
  async *stream() { summarizerCalled = true; yield { type: 'text_delta', delta: 'NOPE' }; yield { type: 'message_stop' }; },
};
const vetoed = await maybeCompact(baseHistory, {
  triggerTokens: 50,
  preserveLastTurns: 2,
  summarizer: vetoSummarizer,
  summaryModel: 'fake-model',
  hooks: hooks2,
});
check('veto blocks compaction',         vetoed.compacted === false);
check('summarizer never invoked',        summarizerCalled === false);
check('history returned unchanged',      vetoed.messages.length === baseHistory.length);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
