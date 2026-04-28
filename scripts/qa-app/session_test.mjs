/**
 * Session store smoke. Locks down `context/session.ts`:
 *   - createSessionStore + create() writes an empty JSONL file
 *   - append() persists a SessionEntry as one JSON line
 *   - messages() round-trips message entries (skipping non-message events)
 *   - replay() yields every entry verbatim, in append order
 *   - open() finds an existing session, returns undefined for unknown ids
 *   - list() enumerates only `.jsonl` ids
 *   - ill-formed trailing line is silently skipped (crash-safety)
 *
 * Uses a sandboxed directory so the test never touches the real store.
 */

import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'session-test-'));

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { createSessionStore } = await import(_toUrl(_join(ROOT, 'context/session.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const store = createSessionStore({ directory: sandbox });

console.log('\n=== session: create + append + messages() round-trip ===');
const a = await store.create('sess-a');
check('session id preserved',          a.id === 'sess-a');
check('jsonl file initialised',         existsSync(a.path));

await a.append({ type: 'message', ts: '2026-04-25T00:00:00Z', message: { role: 'user', content: 'hello' } });
await a.append({ type: 'usage',   ts: '2026-04-25T00:00:01Z', usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, costUsd: 0 } });
await a.append({ type: 'message', ts: '2026-04-25T00:00:02Z', message: { role: 'assistant', content: 'hi back' } });

const msgs = await a.messages();
check('messages() returns exactly 2',   msgs.length === 2);
check('first is the user msg',          msgs[0].role === 'user');
check('second is the assistant msg',    msgs[1].role === 'assistant');

console.log('\n=== session: replay() yields every entry in order ===');
const seen = [];
for await (const entry of a.replay()) seen.push(entry.type);
check('replay returns 3 entries',       seen.length === 3);
check('order preserved',                seen.join(',') === 'message,usage,message');

console.log('\n=== session: open() finds existing, undefined otherwise ===');
const reopened = await store.open('sess-a');
check('open() returns Session',         reopened !== undefined && reopened?.id === 'sess-a');
const reopenedMsgs = await reopened.messages();
check('reopened sees same messages',    reopenedMsgs.length === 2);

const missing = await store.open('does-not-exist');
check('open() returns undefined on miss', missing === undefined);

console.log('\n=== session: list() enumerates ids ===');
await store.create('sess-b');
const ids = (await store.list()).sort();
check('list contains both ids',         ids.length === 2 && ids[0] === 'sess-a' && ids[1] === 'sess-b');

console.log('\n=== session: malformed trailing line is skipped ===');
writeFileSync(a.path, readFileSync(a.path, 'utf8') + '{ this is not json\n', 'utf8');
const after = await a.messages();
check('still parses 2 messages',         after.length === 2);

console.log('\n=== session: branch entry persists with parent linkage ===');
await a.append({ type: 'branch', ts: '2026-04-25T00:01:00Z', parentId: 'sess-root', name: 'feature-x' });
const branchEntry = [];
for await (const e of a.replay()) if (e.type === 'branch') branchEntry.push(e);
check('branch entry persisted',         branchEntry.length === 1);
check('branch links to parent',         branchEntry[0].parentId === 'sess-root');
check('branch has name',                branchEntry[0].name === 'feature-x');

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
