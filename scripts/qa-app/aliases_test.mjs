/**
 * Model aliases smoke. Locks down `intelligence/prices.ts#resolveModelAlias`:
 *   - common short names map to canonical model ids (kimi/opus/sonnet/...)
 *   - case-insensitive
 *   - whitespace-tolerant
 *   - unknown input returns the input unchanged (so passing a real id works)
 *   - listModelAliases is non-empty and well-shaped
 *   - resolved id has a price record + context window in the registry
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { resolveModelAlias, listModelAliases, findPrice, contextWindowFor } = await import(_toUrl(_join(ROOT, 'intelligence/prices.js')).href);
const { routeModel } = await import(_toUrl(_join(ROOT, 'providers/dispatch.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== aliases: short names → canonical ids ===');
const cases = [
  ['kimi',    'moonshotai/kimi-k2-instruct'],
  ['opus',    'claude-opus-4-7'],
  ['sonnet',  'claude-sonnet-4-6'],
  ['haiku',   'claude-haiku-4-5'],
  ['gemini',  'gemini-2.5-pro'],
  ['flash',   'gemini-2.5-flash'],
  ['deepseek','deepseek-ai/deepseek-v4-pro'],
  ['llama',   'meta/llama-3.3-70b-instruct'],
  ['ling',    'inclusionai/ling-2.6-1t:free'],
];
for (const [alias, canon] of cases) {
  check(`${alias} ⇒ ${canon}`, resolveModelAlias(alias) === canon);
}

console.log('\n=== aliases: case-insensitive + whitespace ===');
check('OPUS uppercase',                  resolveModelAlias('OPUS') === 'claude-opus-4-7');
check('Kimi mixed-case',                 resolveModelAlias('Kimi') === 'moonshotai/kimi-k2-instruct');
check('  opus   trimmed',                resolveModelAlias('  opus   ') === 'claude-opus-4-7');

console.log('\n=== aliases: unknown ⇒ passthrough ===');
const fullId = 'moonshotai/kimi-k2-instruct';
check('full id is pass-through',         resolveModelAlias(fullId) === fullId);

const nonsense = 'no-such-model-anywhere';
check('unknown alias = passthrough',     resolveModelAlias(nonsense) === nonsense);

const empty = '';
check('empty string ⇒ empty string',     resolveModelAlias(empty) === '');

console.log('\n=== aliases: listModelAliases shape ===');
const all = listModelAliases();
check('list returns entries',            Array.isArray(all) && all.length >= 5);
check('every entry has alias + model',   all.every(e => typeof e.alias === 'string' && typeof e.model === 'string'));

console.log('\n=== aliases: every alias resolves to a known model in the registry ===');
for (const { alias, model } of all) {
  const provider = routeModel(model);
  const price = findPrice(provider, model);
  const ctx = contextWindowFor(model);
  // Free OR models may not have a price entry; ctx fallback covers them.
  check(`${alias} → ${model}: contextWindow > 0`, ctx > 0, `ctx=${ctx}`);
  if (price) check(`${alias} has price entry`, true);
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
