/**
 * Ledger: append-only JSONL + living markdown digest.
 *
 * Pattern from jsonl-ledger — restart-safe agent memory.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'ledger-home-'));
process.env.HOME = home;

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { ledgerScope, appendLedger, readLedger, searchLedger, readDigest, writeDigest, renderLedgerContext } = await import(_toUrl(_join(ROOT, 'context/ledger.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== ledger ===');

const scope = ledgerScope('test', home);

// 1. Empty by default.
check('empty scope returns []',           (await readLedger(scope)).length === 0);
check('empty digest is empty string',     (await readDigest(scope)) === '');

// 2. Append + read back.
await appendLedger(scope, { kind: 'goal', text: 'ship dirgha-cli to parity' });
await appendLedger(scope, { kind: 'decision', text: 'use jsonl-ledger ledger pattern', metadata: { rfc: 'parity-matrix' } });
await appendLedger(scope, { kind: 'observation', text: 'kernel hooks compose cleanly' });
const all = await readLedger(scope);
check('3 entries appended',               all.length === 3);
check('first entry has goal kind',        all[0].kind === 'goal');
check('metadata preserved',               all[1].metadata?.rfc === 'parity-matrix');
check('timestamps are ISO',               /^\d{4}-\d{2}-\d{2}T/.test(all[0].ts));

// 3. Tail with limit.
const tail = await readLedger(scope, 2);
check('tail respects limit',              tail.length === 2 && tail[0].kind === 'decision');

// 4. Search.
const hits = await searchLedger(scope, 'pattern');
check('search finds substring',           hits.length === 1 && hits[0].kind === 'decision');
const noHits = await searchLedger(scope, 'no-such-thing');
check('search misses cleanly',            noHits.length === 0);

// 5. Digest.
await writeDigest(scope, '# Test scope\n\n- We chose the jsonl-ledger pattern.');
const digest = await readDigest(scope);
check('digest written + read back',       digest.includes('jsonl-ledger'));
const allAfter = await readLedger(scope);
check('digest write logs compaction',     allAfter.some(e => e.kind === 'compaction'));

// 6. renderLedgerContext for boot-time injection.
const ctx = await renderLedgerContext(scope, { tailEntries: 5 });
check('context has digest section',       ctx.includes('<ledger_digest scope="test">'));
check('context has tail section',         ctx.includes('<ledger_tail scope="test"'));
check('context contains the digest body', ctx.includes('jsonl-ledger'));
check('context contains a tail entry',    ctx.includes('ship dirgha-cli'));

// 7. Empty scope renders empty.
const emptyScope = ledgerScope('untouched', home);
const emptyCtx = await renderLedgerContext(emptyScope);
check('empty scope renders empty',        emptyCtx === '');

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
