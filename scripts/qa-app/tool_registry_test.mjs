/**
 * Tool registry deep test. `tools_smoke.mjs` exercises each built-in
 * tool's *runtime*; this test exercises the *registry* — custom tool
 * registration, allow/denylists, sanitisation rules, MCP-bridged tools.
 *
 * Verifies:
 *   - register accepts valid tools, rejects bad names + duplicates
 *   - unregister removes a tool
 *   - sanitize allowlist / denylist / descriptionLimit work
 *   - bridgeMcpTools converts an MCP client into Tool objects with the
 *     `<server>_<tool>` naming convention
 */

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { ToolRegistry, createToolRegistry } = await import(_toUrl(_join(ROOT, 'tools/registry.js')).href);
const { bridgeMcpTools } = await import(_toUrl(_join(ROOT, 'mcp/tool-bridge.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const customTool = (name) => ({
  name,
  description: `${name} description`,
  inputSchema: { type: 'object', properties: {} },
  async execute() { return { content: 'ok', isError: false, durationMs: 0 }; },
});

console.log('\n=== registry: register / unregister / has / get / list ===');
const r = new ToolRegistry();
r.register(customTool('alpha'));
r.register(customTool('beta_one'));
check('has alpha',                       r.has('alpha'));
check('has beta_one',                    r.has('beta_one'));
check('get returns the tool',            r.get('alpha')?.name === 'alpha');
check('list returns 2',                  r.list().length === 2);

let threw = false;
try { r.register(customTool('alpha')); } catch { threw = true; }
check('duplicate registration throws',   threw);

threw = false;
try { r.register(customTool('123-bad')); } catch { threw = true; }
check('invalid name (digit start) throws', threw);

threw = false;
try { r.register(customTool('with space')); } catch { threw = true; }
check('invalid name (space) throws',     threw);

const removed = r.unregister('alpha');
check('unregister returns true on hit',  removed);
check('alpha gone',                      !r.has('alpha'));
check('list shrinks to 1',               r.list().length === 1);

console.log('\n=== registry: sanitize allowlist + denylist + descriptionLimit ===');
const r2 = createToolRegistry([
  customTool('alpha'),
  customTool('beta'),
  customTool('gamma'),
]);
const allowed = r2.sanitize({ allowlist: new Set(['alpha', 'gamma']) });
check('allowlist drops beta',            allowed.definitions.length === 2);
check('allowlist keeps alpha + gamma',   allowed.definitions.map(d => d.name).sort().join(',') === 'alpha,gamma');

const denied = r2.sanitize({ denylist: new Set(['gamma']) });
check('denylist drops gamma',            denied.definitions.length === 2);
check('denylist keeps alpha + beta',     denied.definitions.map(d => d.name).sort().join(',') === 'alpha,beta');

const longDesc = customTool('longone');
longDesc.description = 'x'.repeat(500);
const r3 = createToolRegistry([longDesc]);
const truncated = r3.sanitize({ descriptionLimit: 50 });
check('descriptionLimit truncates',      truncated.definitions[0].description.length === 50);
check('truncation marker present',       truncated.definitions[0].description.endsWith('...'));

console.log('\n=== registry: bridgeMcpTools ⇒ <server>_<tool> naming ===');
const fakeMcpClient = {
  async initialize() { return { protocolVersion: '2024-11-05', serverInfo: { name: 'fake', version: '0' }, capabilities: {} }; },
  async listTools() {
    return [
      { name: 'echo',  description: 'echoes input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
      { name: 'count', description: 'counts',       inputSchema: { type: 'object' } },
    ];
  },
  async callTool(name, args) {
    return { content: [{ type: 'text', text: `bridged ${name}: ${JSON.stringify(args)}` }], isError: false };
  },
  async close() {},
};

const bridged = await bridgeMcpTools(fakeMcpClient, { serverName: 'fs' });
check('bridged tool count = 2',          bridged.length === 2);
const bridgedNames = bridged.map(t => t.name).sort();
check('echo bridged as fs_echo',         bridgedNames.includes('fs_echo'));
check('count bridged as fs_count',        bridgedNames.includes('fs_count'));

const echoBridge = bridged.find(t => t.name === 'fs_echo');
const result = await echoBridge.execute({ text: 'hi' }, new AbortController().signal);
check('bridged tool round-trips',        /bridged echo/.test(result.content));
check('bridged result not error',        result.isError === false);

// Final integration: a registry combining built-in + custom + bridged.
console.log('\n=== registry: composes built-in + custom + MCP-bridged ===');
const r4 = createToolRegistry([
  customTool('builtin_a'),
  customTool('custom_b'),
  ...bridged,
]);
check('total = 4',                       r4.list().length === 4);
const names = r4.list().map(t => t.name).sort();
check('all four names visible',           names.join(',') === 'builtin_a,custom_b,fs_count,fs_echo');

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
