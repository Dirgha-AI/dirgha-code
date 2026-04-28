/**
 * Multi-key BYOK pool. Locks down `auth/keypool.ts`:
 *   - addEntry stamps id/label/priority/addedAt and persists at 0600
 *   - readPool round-trips
 *   - pickEntry picks highest priority then LRU-ties
 *   - markExhausted hides the entry until cooldown expires
 *   - hydrateEnvFromPool copies the picked entry into process.env
 *     and respects shell overrides (real env wins)
 *   - removeEntry / clearProvider work
 *   - concurrent addEntry calls under the lock all land
 *
 * Uses a sandboxed HOME so the user's real ~/.dirgha is untouched.
 */

import { mkdtempSync, mkdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'keypool-test-'));
mkdirSync(join(sandbox, '.dirgha'), { recursive: true });

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const kp = await import(_toUrl(_join(ROOT, 'auth/keypool.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== keypool: addEntry persists with id/label/priority ===');
const a = await kp.addEntry('NVIDIA_API_KEY', 'nv-aaa', { home: sandbox });
const b = await kp.addEntry('NVIDIA_API_KEY', 'nv-bbb', { label: 'backup', priority: 5, home: sandbox });
check('first entry has 6-hex id',         /^[0-9a-f]{6}$/.test(a.id));
check('first label defaults to key-1',     a.label === 'key-1');
check('second uses explicit label',        b.label === 'backup');
check('second has priority=5',             b.priority === 5);

const pool = await kp.readPool(sandbox);
check('two entries persisted',             (pool.NVIDIA_API_KEY ?? []).length === 2);

if (process.platform !== 'win32') {
  const mode = statSync(join(sandbox, '.dirgha', 'keypool.json')).mode & 0o777;
  check('keypool.json mode = 0600',         mode === 0o600);
}

console.log('\n=== keypool: pickEntry picks highest priority ===');
const picked1 = kp.pickEntry(pool, 'NVIDIA_API_KEY');
check('priority 5 wins over priority 0',   picked1?.id === b.id, `picked=${picked1?.id}`);

console.log('\n=== keypool: markExhausted hides the entry ===');
await kp.markExhausted('NVIDIA_API_KEY', b.id, new Date(Date.now() + 60_000).toISOString(), sandbox);
const poolAfter = await kp.readPool(sandbox);
const picked2 = kp.pickEntry(poolAfter, 'NVIDIA_API_KEY');
check('exhausted entry hidden',            picked2?.id === a.id);

const cooledPast = new Date(Date.now() - 1000).toISOString();
await kp.markExhausted('NVIDIA_API_KEY', b.id, cooledPast, sandbox);
const poolCooled = await kp.readPool(sandbox);
const picked3 = kp.pickEntry(poolCooled, 'NVIDIA_API_KEY');
check('past-cooldown entry available again', picked3?.id === b.id);

console.log('\n=== keypool: hydrateEnvFromPool copies into process.env ===');
const env1 = {};
const hydrated1 = await kp.hydrateEnvFromPool(env1, sandbox);
check('NVIDIA_API_KEY hydrated',           env1.NVIDIA_API_KEY === 'nv-bbb');
check('hydrated list contains the env',     hydrated1.includes('NVIDIA_API_KEY'));

console.log('\n=== keypool: shell env wins over pool ===');
const env2 = { NVIDIA_API_KEY: 'shell-wins' };
await kp.hydrateEnvFromPool(env2, sandbox);
check('shell value preserved',             env2.NVIDIA_API_KEY === 'shell-wins');

console.log('\n=== keypool: removeEntry by id ===');
await kp.addEntry('OPENROUTER_API_KEY', 'or-1', { home: sandbox });
const c = await kp.addEntry('OPENROUTER_API_KEY', 'or-2', { home: sandbox });
const removed = await kp.removeEntry('OPENROUTER_API_KEY', c.id, sandbox);
check('removeEntry returns true',          removed === true);
const orPool = (await kp.readPool(sandbox)).OPENROUTER_API_KEY;
check('one OR entry remains',              orPool.length === 1);

const ghostRemoval = await kp.removeEntry('OPENROUTER_API_KEY', 'no-such-id', sandbox);
check('non-existent id returns false',     ghostRemoval === false);

console.log('\n=== keypool: clearProvider drops all + cleans up ===');
const clearedCount = await kp.clearProvider('OPENROUTER_API_KEY', sandbox);
check('clearProvider returns count',       clearedCount === 1);
check('OR key gone from pool',             (await kp.readPool(sandbox)).OPENROUTER_API_KEY === undefined);

console.log('\n=== keypool: concurrent addEntry calls all land ===');
{
  const fresh = mkdtempSync(join(tmpdir(), 'keypool-concur-'));
  mkdirSync(join(fresh, '.dirgha'), { recursive: true });
  const promises = Array.from({ length: 8 }, (_, i) =>
    kp.addEntry('GROQ_API_KEY', `gr-${i}`, { home: fresh, label: `n${i}` }));
  await Promise.all(promises);
  const final = await kp.readPool(fresh);
  check('all 8 concurrent entries persisted', (final.GROQ_API_KEY ?? []).length === 8, `got ${(final.GROQ_API_KEY ?? []).length}`);
  check('all 8 ids are unique',               new Set((final.GROQ_API_KEY ?? []).map(e => e.id)).size === 8);
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
