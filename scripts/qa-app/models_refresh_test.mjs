/**
 * `dirgha models refresh` core. Drives `intelligence/models-refresh.ts`
 * with an injected fetch so the test never hits the network. Mirrors
 * the dogfood SPEC.md plus extra TS-side assertions.
 *
 * Coverage:
 *   - fetchProviderModels happy path: { data: [{id}, ...] } → models[]
 *   - non-200 → error contains the status, models stays []
 *   - throw → error string set, models stays []
 *   - apiKey present  → fetchImpl receives Authorization: Bearer …
 *   - apiKey missing  → no Authorization header
 *   - missing data field → empty models array, no error
 *   - refreshAllModels with 3 providers (one throws) → totalModels skips error
 *   - refreshAllModels: fetchedAt is ISO
 *   - readCache + writeCache roundtrip preserves shape
 *   - readCache missing file → null
 *   - readCache malformed JSON → null (no throw)
 *   - readCache wrong shape → null (defensive)
 *   - writeCache file mode 0600 (POSIX)
 *   - isCacheFresh fresh / stale / null cache
 *   - isCacheFresh: cache with malformed fetchedAt → false
 */

import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const mr = await import(_toUrl(_join(ROOT, 'intelligence/models-refresh.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const okFetch = (ids, captured) => async (url, init) => {
  if (captured) { captured.url = url; captured.headers = init?.headers ?? {}; }
  return { ok: true, status: 200, json: async () => ({ data: ids.map(id => ({ id })) }) };
};

console.log('\n=== fetchProviderModels: happy path ===');
{
  const r = await mr.fetchProviderModels({ name: 'or', baseUrl: 'http://x/v1', fetchImpl: okFetch(['m1', 'm2']) });
  check('two ids returned',                 r.models.length === 2 && r.models[0] === 'm1');
  check('no error',                          r.error === undefined);
  check('fetchedAt is ISO',                  /^\d{4}-\d{2}-\d{2}T/.test(r.fetchedAt));
}

console.log('\n=== fetchProviderModels: non-200 ===');
{
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await mr.fetchProviderModels({ name: 'oops', baseUrl: 'http://x/v1', fetchImpl });
  check('models is empty',                  r.models.length === 0);
  check('error mentions HTTP 503',           /503/.test(r.error ?? ''));
}

console.log('\n=== fetchProviderModels: throw ===');
{
  const fetchImpl = async () => { throw new Error('ENOTFOUND'); };
  const r = await mr.fetchProviderModels({ name: 'gone', baseUrl: 'http://x/v1', fetchImpl });
  check('models still []',                  r.models.length === 0);
  check('error contains ENOTFOUND',          /ENOTFOUND/.test(r.error ?? ''));
}

console.log('\n=== fetchProviderModels: Authorization header presence ===');
{
  const captured = {};
  await mr.fetchProviderModels({ name: 'auth', baseUrl: 'http://x/v1', apiKey: 'sk-abc', fetchImpl: okFetch([], captured) });
  check('Authorization header sent',        captured.headers?.Authorization === 'Bearer sk-abc');

  const captured2 = {};
  await mr.fetchProviderModels({ name: 'noauth', baseUrl: 'http://x/v1', fetchImpl: okFetch([], captured2) });
  check('no Authorization without apiKey',  captured2.headers?.Authorization === undefined);
}

console.log('\n=== fetchProviderModels: missing data field is benign ===');
{
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ /* no data */ }) });
  const r = await mr.fetchProviderModels({ name: 'empty', baseUrl: 'http://x/v1', fetchImpl });
  check('empty models[]',                   r.models.length === 0);
  check('no error',                          r.error === undefined);
}

console.log('\n=== refreshAllModels: parallel + per-provider error isolation ===');
{
  const fetchImpl = async (url) => {
    if (url.startsWith('http://a/')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'a1' }, { id: 'a2' }] }) };
    if (url.startsWith('http://b/')) throw new Error('boom');
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'c1' }] }) };
  };
  const cache = await mr.refreshAllModels({
    providers: [
      { name: 'a', baseUrl: 'http://a/v1' },
      { name: 'b', baseUrl: 'http://b/v1' },
      { name: 'c', baseUrl: 'http://c/v1' },
    ],
    fetchImpl,
  });
  check('three provider entries',           cache.providers.length === 3);
  check('totalModels excludes the broken provider', cache.totalModels === 3);
  const broken = cache.providers.find(p => p.name === 'b');
  check('error preserved on broken entry',  /boom/.test(broken?.error ?? ''));
  check('cache.fetchedAt is ISO',           /^\d{4}-\d{2}-\d{2}T/.test(cache.fetchedAt));
}

console.log('\n=== readCache + writeCache roundtrip ===');
{
  const sandbox = mkdtempSync(join(tmpdir(), 'mrcache-'));
  const path = join(sandbox, 'cache.json');
  const original = { fetchedAt: new Date().toISOString(), totalModels: 1, providers: [{ name: 'x', baseUrl: 'http://x', models: ['x1'], fetchedAt: new Date().toISOString() }] };
  await mr.writeCache(path, original);
  const back = await mr.readCache(path);
  check('shape preserved',                  back?.totalModels === 1 && back?.providers?.[0]?.models?.[0] === 'x1');

  if (process.platform !== 'win32') {
    const mode = statSync(path).mode & 0o777;
    check('cache file mode 0600',           mode === 0o600);
  }

  const missing = await mr.readCache(join(sandbox, 'no-such.json'));
  check('missing file → null',              missing === null);

  await mr.writeCache(path, { not: 'a cache' });
  const wrongShape = await mr.readCache(path);
  check('wrong-shape JSON → null',          wrongShape === null);
}

console.log('\n=== readCache: malformed JSON does not throw ===');
{
  const sandbox = mkdtempSync(join(tmpdir(), 'mrbad-'));
  const path = join(sandbox, 'cache.json');
  await (await import('node:fs/promises')).writeFile(path, '{ this is not json', 'utf8');
  const back = await mr.readCache(path);
  check('malformed → null',                 back === null);
}

console.log('\n=== isCacheFresh: TTL gate ===');
{
  const fresh = { fetchedAt: new Date().toISOString(), totalModels: 0, providers: [] };
  check('1 min ago + 5 min TTL → fresh',    mr.isCacheFresh(fresh, 5 * 60_000) === true);

  const stale = { fetchedAt: new Date(Date.now() - 10 * 60_000).toISOString(), totalModels: 0, providers: [] };
  check('10 min ago + 5 min TTL → stale',    mr.isCacheFresh(stale, 5 * 60_000) === false);

  check('null cache → false',                mr.isCacheFresh(null, 60_000) === false);

  const malformed = { fetchedAt: 'not-a-date', totalModels: 0, providers: [] };
  check('malformed fetchedAt → false',      mr.isCacheFresh(malformed, 60_000) === false);
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
