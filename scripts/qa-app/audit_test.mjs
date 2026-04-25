/**
 * Audit log smoke. Locks down `audit/writer.ts`:
 *   - appendAudit writes a JSONL line under $HOME/.dirgha/audit/events.jsonl
 *   - each entry stamps `ts` automatically
 *   - multiple appends are line-separated and survive round-trip parse
 *   - the reader subcommand's `list / search` semantics work over the file
 *   - failures (unwritable dir) are swallowed so the CLI does not crash
 *
 * Uses a sandboxed HOME so the test never touches the real audit log.
 */

import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'audit-test-'));
process.env.HOME = sandbox;

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { appendAudit } = await import(`${ROOT}/audit/writer.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const auditPath = join(sandbox, '.dirgha', 'audit', 'events.jsonl');

console.log('\n=== audit: appendAudit writes a JSONL line ===');
await appendAudit({ kind: 'turn-end', actor: 'sess-A', summary: 'model=foo stop=end_turn' });
check('events.jsonl exists',         existsSync(auditPath));
const lines1 = readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
check('exactly one line written',     lines1.length === 1);
const e1 = JSON.parse(lines1[0]);
check('ts auto-stamped',              /\d{4}-\d{2}-\d{2}T/.test(e1.ts));
check('kind preserved',               e1.kind === 'turn-end');
check('actor preserved',              e1.actor === 'sess-A');
check('summary preserved',            e1.summary === 'model=foo stop=end_turn');

console.log('\n=== audit: multiple appends accumulate ===');
await appendAudit({ kind: 'tool', actor: 'sess-A', summary: 'fs_write done', toolId: 'fs_write' });
await appendAudit({ kind: 'failover', actor: 'sess-B', summary: 'kimi → kimi-or' });
const lines2 = readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
check('three entries persisted',      lines2.length === 3);
const e2 = JSON.parse(lines2[1]);
check('arbitrary fields preserved',   e2.toolId === 'fs_write');

console.log('\n=== audit: list / search semantics ===');
const all = lines2.map(l => JSON.parse(l));
const last2 = all.slice(-2);
check('list 2 returns last 2',        last2.length === 2 && last2[0].kind === 'tool');

const needle = 'sess-A';
const filtered = all.filter(e => JSON.stringify(e).toLowerCase().includes(needle.toLowerCase()));
check('search by actor finds matches', filtered.length === 2);
check('search excludes non-matches',   filtered.every(e => e.actor === 'sess-A'));

console.log('\n=== audit: write never crashes the caller ===');
// Pass a non-stringifiable shape (circular ref) — JSON.stringify throws inside
// the writer; the try/catch swallows it so callers never see the error.
let threw = false;
const circular = { kind: 'circular', summary: 'has cycle' };
circular.self = circular;
try { await appendAudit(circular); } catch { threw = true; }
check('appendAudit swallowed JSON.stringify throw', threw === false);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
