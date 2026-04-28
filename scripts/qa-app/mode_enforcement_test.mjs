/**
 * Mode-based tool gating: in plan/verify mode, write tools must be
 * blocked at the kernel hook layer (not just nudged via system
 * prompt).
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { enforceMode, composeHooks, WRITE_TOOLS } = await import(_toUrl(_join(ROOT, 'context/mode-enforcement.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== mode enforcement ===');

const fakeCall = (name) => ({ id: 't1', name, input: {} });

// 1. ACT mode: no enforcement at all (returns undefined).
const actHooks = enforceMode('act');
check('act mode returns undefined hooks', actHooks === undefined);

// 2. PLAN mode: blocks every write tool.
const planHooks = enforceMode('plan');
check('plan mode produces hooks', planHooks?.beforeToolCall !== undefined);

for (const writer of ['fs_write', 'fs_edit', 'shell', 'git']) {
  const r = await planHooks.beforeToolCall(fakeCall(writer));
  check(`plan blocks ${writer}`, r?.block === true && /PLAN/.test(r.reason ?? ''));
}

// 3. PLAN allows reads.
for (const reader of ['fs_read', 'fs_ls', 'search_grep', 'search_glob']) {
  const r = await planHooks.beforeToolCall(fakeCall(reader));
  check(`plan allows ${reader}`, r === undefined);
}

// 4. VERIFY mode: same write-block, mentions VERIFY in the reason.
const verifyHooks = enforceMode('verify');
const v = await verifyHooks.beforeToolCall(fakeCall('shell'));
check('verify blocks shell with VERIFY message', v?.block === true && /VERIFY/.test(v.reason ?? ''));

// 4b. ASK mode: read-only Q&A — same enforcement, ASK in the reason.
const askHooks = enforceMode('ask');
check('ask mode produces hooks', askHooks?.beforeToolCall !== undefined);
const askWrite = await askHooks.beforeToolCall(fakeCall('fs_write'));
check('ask blocks fs_write with ASK message', askWrite?.block === true && /ASK/.test(askWrite.reason ?? ''));
const askShell = await askHooks.beforeToolCall(fakeCall('shell'));
check('ask blocks shell',                   askShell?.block === true);
const askRead = await askHooks.beforeToolCall(fakeCall('fs_read'));
check('ask allows fs_read',                  askRead === undefined);

// 5. WRITE_TOOLS exports the canonical set.
check('WRITE_TOOLS includes fs_write', WRITE_TOOLS.has('fs_write'));
check('WRITE_TOOLS includes shell',    WRITE_TOOLS.has('shell'));
check('WRITE_TOOLS excludes fs_read',  !WRITE_TOOLS.has('fs_read'));

console.log('\n=== composeHooks ===');

// 6. Both undefined → undefined.
check('compose(undefined, undefined) is undefined', composeHooks(undefined, undefined) === undefined);

// 7. One undefined → returns the other.
check('compose(a, undefined) returns a', composeHooks(planHooks, undefined) === planHooks);
check('compose(undefined, b) returns b', composeHooks(undefined, planHooks) === planHooks);

// 8. Both set → blocks fire from the first that triggers.
const userHooks = {
  beforeToolCall: async (call) => {
    // Block fs_read — a tool plan does NOT block — to prove the user
    // hook fires when plan passes the call through.
    if (call.name === 'fs_read') return { block: true, reason: 'user blocks reads in this test' };
    return undefined;
  },
};
const composed = composeHooks(planHooks, userHooks);
const a = await composed.beforeToolCall(fakeCall('fs_write'));
check('composed: mode block wins for fs_write', a?.block === true && /PLAN/.test(a.reason ?? ''));
const b = await composed.beforeToolCall(fakeCall('fs_read'));
check('composed: user block wins for fs_read',  b?.block === true && /user blocks reads/.test(b.reason ?? ''));
const c = await composed.beforeToolCall(fakeCall('search_grep'));
check('composed: tool nobody blocks passes through', c === undefined);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
