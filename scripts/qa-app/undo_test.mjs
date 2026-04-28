/**
 * `dirgha undo` smoke. Drives the subcommand directly against a
 * sandboxed sessions dir so the user's real history is untouched.
 *
 * Verifies:
 *   - undo 1 drops the last user-turn + everything after it
 *   - undo 2 drops the last two user-turns
 *   - undo creates a .bak snapshot before rewriting
 *   - undo on an unknown count (more turns than exist) drops everything
 *   - --list shows the last 10 messages without modifying the file
 *   - --json emits structured output
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../../dist_v2/cli/main.js');
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sandbox = mkdtempSync(join(tmpdir(), 'undo-test-'));
const sessionsDir = join(sandbox, '.dirgha', 'sessions');
mkdirSync(sessionsDir, { recursive: true });

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const sessionFile = join(sessionsDir, 'sess-A.jsonl');

function rebuildSession(turns) {
  // turns: array of { role, ts }
  const lines = [];
  let i = 0;
  for (const t of turns) {
    if (t.role === 'system') {
      lines.push(JSON.stringify({ type: 'message', ts: t.ts, message: { role: 'system', content: 'sys' } }));
    } else if (t.role === 'user') {
      lines.push(JSON.stringify({ type: 'message', ts: t.ts, message: { role: 'user', content: `u${i++}` } }));
    } else if (t.role === 'assistant') {
      lines.push(JSON.stringify({ type: 'message', ts: t.ts, message: { role: 'assistant', content: `a${i}` } }));
    } else if (t.role === 'usage') {
      lines.push(JSON.stringify({ type: 'usage', ts: t.ts, usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, costUsd: 0 } }));
    }
  }
  writeFileSync(sessionFile, lines.join('\n') + '\n', 'utf8');
}

function runUndo(args) {
  // Windows: os.homedir() reads %USERPROFILE%, not $HOME.
  const env = { ...process.env, HOME: sandbox, USERPROFILE: sandbox };
  const res = spawnSync('node',
    [BIN, 'undo', ...args],
    { env, encoding: 'utf8' });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

console.log('\n=== undo: drop last user turn (default n=1) ===');
rebuildSession([
  { role: 'system',    ts: '2026-04-25T00:00:00Z' },
  { role: 'user',      ts: '2026-04-25T00:01:00Z' }, // u0
  { role: 'assistant', ts: '2026-04-25T00:01:05Z' },
  { role: 'usage',     ts: '2026-04-25T00:01:06Z' },
  { role: 'user',      ts: '2026-04-25T00:02:00Z' }, // u1 (most recent)
  { role: 'assistant', ts: '2026-04-25T00:02:05Z' },
]);
const r1 = runUndo(['--session=sess-A', '1']);
check('undo 1 exits 0',                   r1.status === 0);
check('backup file created',              existsSync(`${sessionFile}.bak`));
const after1 = readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
check('after undo 1: 4 entries kept',     after1.length === 4);
const userMsgs1 = after1.filter(e => e.type === 'message' && e.message?.role === 'user');
check('after undo 1: only one user msg',  userMsgs1.length === 1);

console.log('\n=== undo: drop last two user turns ===');
rebuildSession([
  { role: 'system',    ts: '2026-04-25T00:00:00Z' },
  { role: 'user',      ts: '2026-04-25T00:01:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:01:05Z' },
  { role: 'user',      ts: '2026-04-25T00:02:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:02:05Z' },
  { role: 'user',      ts: '2026-04-25T00:03:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:03:05Z' },
]);
const r2 = runUndo(['--session=sess-A', '2']);
check('undo 2 exits 0',                   r2.status === 0);
const after2 = readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const userMsgs2 = after2.filter(e => e.type === 'message' && e.message?.role === 'user');
check('after undo 2: 1 user msg remains', userMsgs2.length === 1);
check('after undo 2: system kept',         after2[0].message?.role === 'system');

console.log('\n=== undo: more than turns-available drops everything ===');
rebuildSession([
  { role: 'system',    ts: '2026-04-25T00:00:00Z' },
  { role: 'user',      ts: '2026-04-25T00:01:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:01:05Z' },
]);
const r3 = runUndo(['--session=sess-A', '5']);
check('undo 5 exits 0',                   r3.status === 0);
const after3 = readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
check('over-undo drops everything',       after3.length === 0);

console.log('\n=== undo --list: read-only ===');
rebuildSession([
  { role: 'system',    ts: '2026-04-25T00:00:00Z' },
  { role: 'user',      ts: '2026-04-25T00:01:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:01:05Z' },
]);
const beforeBytes = readFileSync(sessionFile, 'utf8').length;
const r4 = runUndo(['--session=sess-A', '--list']);
check('--list exits 0',                   r4.status === 0);
check('--list shows messages',            /system|user|assistant/.test(r4.stdout));
const afterBytes = readFileSync(sessionFile, 'utf8').length;
check('--list does not modify the file',  beforeBytes === afterBytes);

console.log('\n=== undo --json: structured output ===');
rebuildSession([
  { role: 'system',    ts: '2026-04-25T00:00:00Z' },
  { role: 'user',      ts: '2026-04-25T00:01:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:01:05Z' },
  { role: 'user',      ts: '2026-04-25T00:02:00Z' },
  { role: 'assistant', ts: '2026-04-25T00:02:05Z' },
]);
const r5 = runUndo(['--session=sess-A', '1', '--json']);
check('--json exits 0',                   r5.status === 0);
let parsed = null;
try { parsed = JSON.parse(r5.stdout.trim().split('\n').pop()); } catch { /* */ }
check('--json output parses',             parsed !== null && typeof parsed === 'object');
check('--json reports sessionId',          parsed?.sessionId === 'sess-A');
check('--json reports dropped count',      typeof parsed?.dropped === 'number' && parsed.dropped > 0);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
