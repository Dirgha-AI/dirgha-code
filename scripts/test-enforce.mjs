// scripts/test-enforce.mjs
// Mode enforcement kernel unit tests — run with: node scripts/test-enforce.mjs
import { enforceMode } from '../dist/context/mode-enforcement.js';

const tests = [
  ['plan',   'fs_write',    true],
  ['plan',   'fs_edit',     true],
  ['plan',   'shell',       true],
  ['plan',   'git',         true],
  ['plan',   'read_file',   false],
  ['plan',   'search_grep', false],
  ['act',    'fs_write',    false],
  ['verify', 'fs_write',    true],
  ['verify', 'shell',       true],
  ['ask',    'fs_write',    true],
  ['ask',    'browser',     true],
  ['ask',    'read_file',   false],
];

let pass = 0, fail = 0;
for (const [mode, tool, expectBlock] of tests) {
  const hooks = enforceMode(mode);
  let didBlock;
  if (!hooks) { didBlock = false; }
  else {
    const r = await hooks.beforeToolCall({ id: 'test', name: tool, input: {} });
    didBlock = !!r?.block;
  }
  const ok = didBlock === expectBlock;
  console.log(`${ok ? '✓' : '✗'} mode=${mode} tool=${tool} blocked=${didBlock}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} passed${fail > 0 ? ' — FAILURES ABOVE' : ''}`);
process.exit(fail > 0 ? 1 : 0);
