/**
 * BYOK keystore smoke. Locks down `auth/keystore.ts`:
 *   - readKeyStore returns {} when the file is absent
 *   - readKeyStore parses a valid JSON store
 *   - readKeyStore returns {} when the file is malformed (no throw)
 *   - hydrateEnvFromKeyStore copies stored keys into env when unset
 *   - real env vars beat the file (shell override wins)
 *   - empty-string stored values are skipped (don't shadow a real env)
 *   - hydration is idempotent — second call is a no-op
 *
 * Uses a temp file path so the real ~/.dirgha/keys.json is never read.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'keys-test-'));
const keyFile = join(sandbox, 'keys.json');

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { readKeyStore, hydrateEnvFromKeyStore } = await import(`${ROOT}/auth/keystore.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== keys: readKeyStore is fail-safe ===');
const empty = await readKeyStore(keyFile);
check('missing file → empty object',     Object.keys(empty).length === 0);

writeFileSync(keyFile, '{ this is not json', 'utf8');
const broken = await readKeyStore(keyFile);
check('malformed file → empty object',   Object.keys(broken).length === 0);

writeFileSync(keyFile, JSON.stringify({ NVIDIA_API_KEY: 'nv-1234567890', OPENAI_API_KEY: 'sk-abcd1234' }), 'utf8');
const ok = await readKeyStore(keyFile);
check('valid file parses 2 entries',     Object.keys(ok).length === 2);
check('NVIDIA value preserved',           ok.NVIDIA_API_KEY === 'nv-1234567890');

console.log('\n=== keys: hydrateEnvFromKeyStore copies missing entries ===');
const env1 = {};
const hydrated1 = await hydrateEnvFromKeyStore(env1, keyFile);
check('two entries hydrated',            hydrated1.length === 2);
check('NVIDIA key on env',                env1.NVIDIA_API_KEY === 'nv-1234567890');
check('OPENAI key on env',                env1.OPENAI_API_KEY === 'sk-abcd1234');

console.log('\n=== keys: real env wins (shell override) ===');
const env2 = { NVIDIA_API_KEY: 'shell-override' };
const hydrated2 = await hydrateEnvFromKeyStore(env2, keyFile);
check('only the missing one hydrated',    hydrated2.length === 1 && hydrated2[0] === 'OPENAI_API_KEY');
check('shell value preserved',            env2.NVIDIA_API_KEY === 'shell-override');
check('OPENAI hydrated alongside it',     env2.OPENAI_API_KEY === 'sk-abcd1234');

console.log('\n=== keys: empty-string in store is skipped ===');
writeFileSync(keyFile, JSON.stringify({ FIREWORKS_API_KEY: '', OPENROUTER_API_KEY: 'or-xyz' }), 'utf8');
const env3 = {};
const hydrated3 = await hydrateEnvFromKeyStore(env3, keyFile);
check('empty string not hydrated',        env3.FIREWORKS_API_KEY === undefined);
check('non-empty entry hydrated',         env3.OPENROUTER_API_KEY === 'or-xyz');
check('hydrated count = 1',               hydrated3.length === 1);

console.log('\n=== keys: idempotent on repeat call ===');
const hydrated4 = await hydrateEnvFromKeyStore(env3, keyFile);
check('second call hydrates nothing',     hydrated4.length === 0);
check('value stays the same',             env3.OPENROUTER_API_KEY === 'or-xyz');

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
