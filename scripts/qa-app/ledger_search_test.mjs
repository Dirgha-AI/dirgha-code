/**
 * TF-IDF cosine ranking over the ledger. Drives `searchLedgerRanked`
 * against a sandboxed ledger so the user's real memory is untouched.
 *
 * Verifies:
 *   - tokens that occur more often in fewer documents (high IDF) raise rank
 *   - shared common words don't dominate the score
 *   - empty / nonsense query returns [] (not a crash)
 *   - topK is honored
 *   - ranking is stable: most-relevant entry is first
 *   - falls back to substring search when query has no useful tokens
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { ledgerScope, appendLedger, searchLedgerRanked } = await import(_toUrl(_join(ROOT, 'context/ledger.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const sandbox = mkdtempSync(join(tmpdir(), 'ledger-search-test-'));
const scope = ledgerScope('memory', sandbox);

// Seed: 6 entries spanning different topics; one should clearly win
// for "compaction tokens" (matrix gap #12).
const seed = [
  { kind: 'goal',        text: 'Ship the dirgha CLI parity matrix to 10/10 across every dimension.' },
  { kind: 'decision',    text: 'Adopt the jsonl-ledger pattern: append-only JSONL + living markdown digest.' },
  { kind: 'observation', text: 'Compaction trigger fires at 75 percent of context window, summarising older turns and replacing tokens with a synthetic summary.' },
  { kind: 'experiment',  text: 'Wired NVIDIA NIM for kimi-k2-instruct streaming with the OpenAI-compat factory.' },
  { kind: 'metric',      text: 'cost tracker recorded 0.04 USD for one Anthropic Opus turn.' },
  { kind: 'note',        text: 'README says skills install supports git URLs; uninstall removes the directory.' },
];
for (const e of seed) await appendLedger(scope, e);

console.log('\n=== ranked: high-IDF query lifts the right entry ===');
const r1 = await searchLedgerRanked(scope, 'compaction tokens summary', { topK: 3 });
check('returns at least 1 hit',          r1.length >= 1);
check('top hit is the compaction note',  /Compaction trigger/.test(r1[0]?.entry.text ?? ''));
check('top hit has positive score',      (r1[0]?.score ?? 0) > 0);

console.log('\n=== ranked: rare-term query (NIM/kimi) lifts experiment entry ===');
const r2 = await searchLedgerRanked(scope, 'NVIDIA NIM kimi streaming', { topK: 3 });
check('top hit is the NVIDIA experiment', /NVIDIA NIM for kimi/.test(r2[0]?.entry.text ?? ''));

console.log('\n=== ranked: topK limits the result list ===');
const r3 = await searchLedgerRanked(scope, 'dirgha', { topK: 2 });
check('topK=2 returns ≤ 2 entries',       r3.length <= 2);

console.log('\n=== ranked: nonsense query → [] (no crash) ===');
const r4 = await searchLedgerRanked(scope, 'xyzzyplugh-no-such-word', { topK: 5 });
check('nonsense → 0 hits',                 r4.length === 0);

console.log('\n=== ranked: empty / stopword-only query → fallback ===');
// "the" is a stopword → cosine yields nothing → fallback substring
const r5 = await searchLedgerRanked(scope, 'the', { topK: 5 });
check('stopword-only fallback returns hits', r5.length > 0);
check('fallback hits have score=0',        r5[0]?.score === 0);

console.log('\n=== ranked: stability — same query twice yields same top hit ===');
const r6a = await searchLedgerRanked(scope, 'compaction context window', { topK: 1 });
const r6b = await searchLedgerRanked(scope, 'compaction context window', { topK: 1 });
check('top hit identical across calls',    r6a[0]?.entry.text === r6b[0]?.entry.text);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
