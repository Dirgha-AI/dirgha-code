/**
 * Extension API + loader. Drives `extensions/api.ts`:
 *   - createExtensionAPI returns api + empty registry
 *   - registerTool / registerSlash / registerSubcommand happy path
 *   - duplicates throw
 *   - bad names throw (digit start, spaces, empty)
 *   - on(event, handler) accumulates; non-function rejected
 *   - emitEvent fires every listener with payload
 *   - emitEvent isolates listener errors
 *   - loadExtensions: missing rootDir → { loaded: [], failed: [] }
 *   - loadExtensions: tmp dir with one valid extension → tool registered
 *   - loadExtensions: tmp dir with broken extension → captured in failed[]
 *   - loadExtensions: handles async default export
 *   - loadExtensions: stacks multiple extensions
 *   - loadExtensions: skips files that aren't directories
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const ext = await import(_toUrl(_join(ROOT, 'extensions/api.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== createExtensionAPI: empty registry ===');
{
  const { api, registry } = ext.createExtensionAPI();
  check('api exposes registerTool',         typeof api.registerTool === 'function');
  check('api exposes registerSlash',         typeof api.registerSlash === 'function');
  check('api exposes registerSubcommand',    typeof api.registerSubcommand === 'function');
  check('api exposes on',                    typeof api.on === 'function');
  check('registry.tools is empty Map',       registry.tools instanceof Map && registry.tools.size === 0);
  check('registry.listeners is empty Map',   registry.listeners instanceof Map && registry.listeners.size === 0);
}

console.log('\n=== registerTool: happy path + duplicates + bad names ===');
{
  const { api, registry } = ext.createExtensionAPI();
  api.registerTool({ name: 'deploy', description: 'd', inputSchema: { type: 'object' }, execute: async () => ({ content: 'ok', isError: false, durationMs: 0 }) });
  check('tool registered',                  registry.tools.has('deploy'));

  let threw = false;
  try { api.registerTool({ name: 'deploy', description: 'd', inputSchema: {}, execute: async () => ({ content: '', isError: false, durationMs: 0 }) }); }
  catch { threw = true; }
  check('duplicate throws',                  threw);

  for (const bad of ['1bad', 'has space', '']) {
    let t = false;
    try { api.registerTool({ name: bad, description: 'd', inputSchema: {}, execute: async () => ({ content: '', isError: false, durationMs: 0 }) }); }
    catch { t = true; }
    check(`bad name "${bad}" throws`,         t);
  }
}

console.log('\n=== registerSlash + registerSubcommand: dup detection ===');
{
  const { api, registry } = ext.createExtensionAPI();
  api.registerSlash({ name: 'stats', description: 'show', handler: async () => 'ok' });
  let threw = false;
  try { api.registerSlash({ name: 'stats', description: 'dup', handler: async () => '' }); } catch { threw = true; }
  check('duplicate slash throws',            threw);

  api.registerSubcommand({ name: 'foo', description: 'do', run: async () => 0 });
  let t2 = false;
  try { api.registerSubcommand({ name: 'foo', description: 'dup', run: async () => 0 }); } catch { t2 = true; }
  check('duplicate subcommand throws',       t2);
  check('slash + subcommand both registered', registry.slashes.has('stats') && registry.subcommands.has('foo'));
}

console.log('\n=== on(event, handler): accumulation + bad inputs ===');
{
  const { api, registry } = ext.createExtensionAPI();
  api.on('turn_start', () => {});
  api.on('turn_start', () => {});
  api.on('error', () => {});
  check('two turn_start listeners',         registry.listeners.get('turn_start')?.size === 2);
  check('one error listener',                registry.listeners.get('error')?.size === 1);
  let threwE = false; try { api.on('', () => {}); } catch { threwE = true; }
  check('empty event name rejected',         threwE);
  let threwH = false; try { api.on('x', 'not-a-fn'); } catch { threwH = true; }
  check('non-function handler rejected',     threwH);
}

console.log('\n=== emitEvent: fans payload + isolates errors ===');
{
  const { api, registry } = ext.createExtensionAPI();
  const seen = [];
  api.on('toolcall', payload => seen.push(['ok', payload]));
  api.on('toolcall', () => { throw new Error('listener boom'); });
  api.on('toolcall', payload => seen.push(['after-boom', payload]));
  ext.emitEvent(registry, 'toolcall', { id: 'x' });
  check('first listener fired',              seen.some(s => s[0] === 'ok'));
  check('post-throw listener still fired',   seen.some(s => s[0] === 'after-boom'));
  check('payload preserved across listeners', seen.every(([_, p]) => p?.id === 'x'));
}

console.log('\n=== loadExtensions: missing rootDir ===');
{
  const { api } = ext.createExtensionAPI();
  const r = await ext.loadExtensions({ rootDir: '/no-such-place', api });
  check('missing dir → empty result',        r.loaded.length === 0 && r.failed.length === 0);

  const r2 = await ext.loadExtensions({ api });
  check('undefined rootDir → empty result',  r2.loaded.length === 0);
}

console.log('\n=== loadExtensions: actually loads + stacks + isolates failures ===');
{
  const sandbox = mkdtempSync(join(tmpdir(), 'extload-'));

  // ext-a: registers a tool
  mkdirSync(join(sandbox, 'ext-a'));
  writeFileSync(join(sandbox, 'ext-a', 'index.mjs'),
    `export default function (api) { api.registerTool({ name: 'tool_a', description: 'a', inputSchema: {}, execute: async () => ({ content: '', isError: false, durationMs: 0 }) }); }\n`);

  // ext-b: async default + registers a slash
  mkdirSync(join(sandbox, 'ext-b'));
  writeFileSync(join(sandbox, 'ext-b', 'index.mjs'),
    `export default async function (api) { await new Promise(r => setTimeout(r, 5)); api.registerSlash({ name: 'slash_b', description: 'b', handler: () => 'b' }); }\n`);

  // ext-c: throws on import
  mkdirSync(join(sandbox, 'ext-c'));
  writeFileSync(join(sandbox, 'ext-c', 'index.mjs'),
    `throw new Error('synthetic load failure');\n`);

  // ext-d: not-a-directory; should be skipped
  writeFileSync(join(sandbox, 'ext-d-file.mjs'), 'export default function () {}');

  const { api, registry } = ext.createExtensionAPI();
  const r = await ext.loadExtensions({ rootDir: sandbox, api });
  check('two extensions loaded',             r.loaded.length === 2);
  check('ext-a + ext-b in loaded',           r.loaded.includes('ext-a') && r.loaded.includes('ext-b'));
  check('ext-c captured in failed',           r.failed.some(f => f.name === 'ext-c'));
  check('failed entry carries Error',         r.failed[0]?.error instanceof Error);
  check('tool_a registered',                  registry.tools.has('tool_a'));
  check('slash_b registered (async default)', registry.slashes.has('slash_b'));
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
