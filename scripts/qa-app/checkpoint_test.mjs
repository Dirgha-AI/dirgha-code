/**
 * Full checkpoint lifecycle: save → list → restore → delete.
 *
 * Bypasses the agent loop and exercises the tool directly. Uses a
 * scratch HOME so the test can't mutate the user's real ~/.dirgha.
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratchHome = mkdtempSync(join(tmpdir(), 'dirgha-home-'));
process.env.HOME = scratchHome;
// Windows: os.homedir() reads %USERPROFILE%, not $HOME — set both.
process.env.USERPROFILE = scratchHome;
mkdirSync(join(scratchHome, '.dirgha', 'sessions'), { recursive: true });
mkdirSync(join(scratchHome, '.dirgha', 'checkpoints'), { recursive: true });

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { builtInTools, createToolExecutor, createToolRegistry } = await import(_toUrl(_join(ROOT, 'tools/index.js')).href);
const { createSessionStore } = await import(_toUrl(_join(ROOT, 'context/session.js')).href);

const sandbox = mkdtempSync(join(tmpdir(), 'checkpoint-test-'));
process.chdir(sandbox);

// Seed a real session with a few messages so checkpoint has something
// to snapshot. The session lives at ${scratchHome}/.dirgha/sessions/<id>.jsonl
// because we already pointed HOME at scratchHome above.
const sessionId = 'cp-test-session';
const sessions = createSessionStore();
const session = await sessions.create(sessionId);
await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'user', content: 'first turn' } });
await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'response one' }] } });
await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'user', content: 'second turn' } });

const registry = createToolRegistry(builtInTools);
const exec = createToolExecutor({ registry, cwd: sandbox, sessionId });

const log = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  return ok;
};

let pass = 0, fail = 0;
const check = (label, ok, detail) => { (ok ? pass++ : fail++); log(label, ok, detail); };

console.log('\n=== checkpoint lifecycle ===');

// 1. save
const save1 = await exec.execute({ id: 't1', name: 'checkpoint', input: { action: 'save', label: 'baseline' } });
check('save: returns ok',                !save1.isError, save1.content.slice(0, 100));
check('save: writes file under ~/.dirgha/checkpoints', existsSync(join(scratchHome, '.dirgha', 'checkpoints')) && readdirSync(join(scratchHome, '.dirgha', 'checkpoints')).length >= 1);
const saveData = (save1.data ?? {});
const cpId = saveData.id ?? (save1.content.match(/\b([0-9a-f-]{8,}-\d{13,})\b/)?.[1] ?? '');
check('save: returns checkpoint id',     cpId.length > 0, `id=${cpId}`);

// 2. list
const list1 = await exec.execute({ id: 't2', name: 'checkpoint', input: { action: 'list' } });
check('list: returns ok',                !list1.isError);
check('list: includes the saved id',     list1.content.includes(cpId) || list1.content.includes('baseline'));

// 3. save another
const save2 = await exec.execute({ id: 't3', name: 'checkpoint', input: { action: 'save', label: 'second' } });
check('save#2: returns ok',              !save2.isError);
const list2 = await exec.execute({ id: 't4', name: 'checkpoint', input: { action: 'list' } });
const listLines = list2.content.split('\n').filter(l => l.trim());
check('list: now shows two checkpoints', listLines.length >= 2, `lines=${listLines.length}`);

// 4. restore the first one
const restore = await exec.execute({ id: 't5', name: 'checkpoint', input: { action: 'restore', id: cpId } });
check('restore: returns ok',             !restore.isError, restore.content.slice(0, 100));

// 5. delete the second
const cp2Id = (save2.data ?? {}).id ?? (save2.content.match(/\b([0-9a-f-]{8,}-\d{13,})\b/)?.[1] ?? '');
if (cp2Id) {
  const del = await exec.execute({ id: 't6', name: 'checkpoint', input: { action: 'delete', id: cp2Id } });
  check('delete: returns ok',            !del.isError, del.content.slice(0, 100));
  const list3 = await exec.execute({ id: 't7', name: 'checkpoint', input: { action: 'list' } });
  check('list: deleted id is gone',      !list3.content.includes(cp2Id));
}

// 6. unknown action → graceful error
const bogus = await exec.execute({ id: 't8', name: 'checkpoint', input: { action: 'frobulate' } });
check('unknown action: error, no crash', bogus.isError === true);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
