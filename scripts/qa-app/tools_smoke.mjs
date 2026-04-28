/**
 * Smoke each built-in tool by invoking its `execute` directly with a
 * representative happy-path input. This is the layer below the agent
 * loop — no LLM involved — so it isolates tool bugs from
 * model-behaviour bugs.
 *
 * Tools that need external services (browser, real cron) are noted as
 * environment-dependent.
 */

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { builtInTools, createToolExecutor, createToolRegistry } = await import(_toUrl(_join(ROOT, 'tools/index.js')).href);

const sandbox = mkdtempSync(join(tmpdir(), 'tools-smoke-'));
process.chdir(sandbox);
mkdirSync(join(sandbox, 'sub'), { recursive: true });
writeFileSync(join(sandbox, 'a.txt'), 'alpha\nbeta\ngamma\n');
writeFileSync(join(sandbox, 'sub', 'b.txt'), 'TODO: cleanup\n');

const registry = createToolRegistry(builtInTools);
const exec = createToolExecutor({ registry, cwd: sandbox, sessionId: 'tools-smoke' });

const cases = [
  { tool: 'fs_read', input: { path: 'a.txt' }, expect: r => /alpha/.test(r.content) },
  { tool: 'fs_write', input: { path: 'new.txt', content: 'hello' }, expect: r => /Created|wrote/i.test(r.content) },
  { tool: 'fs_edit', input: { path: 'a.txt', oldString: 'alpha', newString: 'omega' }, expect: r => /Edited|edited|Replaced|replaced/i.test(r.content) },
  { tool: 'fs_ls', input: { path: '.' }, expect: r => /a\.txt/.test(r.content) },
  { tool: 'shell', input: { command: 'echo TOOLS_SMOKE_OK' }, expect: r => /TOOLS_SMOKE_OK/.test(r.content) && !r.isError },
  { tool: 'search_grep', input: { pattern: 'alpha|TODO', path: '.' }, expect: r => /TODO|omega/.test(r.content) },
  { tool: 'search_glob', input: { pattern: '**/*.txt', path: '.' }, expect: r => /a\.txt|b\.txt/.test(r.content) },
  // git in a non-repo: should error gracefully
  { tool: 'git', input: { op: 'status' }, expect: r => /not a git|fatal|branch/i.test(r.content) || !r.isError, env: 'non-git-repo expected' },
  // checkpoint without a real session: should error gracefully
  { tool: 'checkpoint', input: { action: 'list' }, expect: r => typeof r.content === 'string', env: 'list mode' },
  // cron list on a fresh sandbox: should return empty list, not crash
  { tool: 'cron', input: { action: 'list' }, expect: r => typeof r.content === 'string', env: 'list mode' },
  // browser: would require launching chromium — skip in CI
  { tool: 'browser', input: { action: 'goto', url: 'about:blank' }, skip: 'requires headless browser env' },
];

const results = [];
for (const c of cases) {
  if (c.skip) {
    results.push({ tool: c.tool, status: 'skip', detail: c.skip });
    continue;
  }
  let result, err;
  try {
    result = await exec.execute({
      id: `t-${c.tool}`,
      name: c.tool,
      input: c.input,
    });
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  if (err) {
    results.push({ tool: c.tool, status: 'fail', detail: `threw: ${err}`, env: c.env });
    continue;
  }
  const pass = c.expect(result);
  results.push({
    tool: c.tool,
    status: pass ? 'pass' : 'fail',
    detail: (result.content || '').slice(0, 120).replace(/\s+/g, ' '),
    env: c.env,
    isError: result.isError,
  });
}

const padN = Math.max(...results.map(r => r.tool.length));
console.log(`\n${'tool'.padEnd(padN)}  status  detail`);
console.log('-'.repeat(120));
let pass = 0, fail = 0, skip = 0;
for (const r of results) {
  const mark = r.status === 'pass' ? '✓' : r.status === 'skip' ? '⊘' : '✗';
  if (r.status === 'pass') pass++;
  else if (r.status === 'skip') skip++;
  else fail++;
  const note = r.env ? ` [${r.env}]` : '';
  console.log(`${r.tool.padEnd(padN)}  ${mark} ${r.status.padEnd(5)}${note}  ${r.detail ?? ''}`);
}
console.log(`\nsummary: ${pass} pass, ${fail} fail, ${skip} skipped`);
process.exit(fail === 0 ? 0 : 1);
