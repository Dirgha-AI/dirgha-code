/**
 * Smoke the browser tool's full happy path:
 *   goto about:blank → content → screenshot → close
 *
 * Skips when playwright isn't resolvable. With Playwright Chromium
 * already installed (we use it for qa-app), this should pass.
 */

import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const { builtInTools, createToolExecutor, createToolRegistry } = await import(_toUrl(_join(ROOT, 'tools/index.js')).href);

// Playwright reachability check.
try {
  await import('playwright');
} catch {
  console.log('SKIP: playwright not resolvable from cli node_modules');
  process.exit(0);
}

const sandbox = mkdtempSync(join(tmpdir(), 'browser-test-'));
process.chdir(sandbox);

const registry = createToolRegistry(builtInTools);
const exec = createToolExecutor({ registry, cwd: sandbox, sessionId: 'browser-smoke' });

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== browser lifecycle ===');

const goto = await exec.execute({ id: 'b1', name: 'browser', input: { action: 'goto', url: 'about:blank' } });
check('goto about:blank ok', !goto.isError, goto.content.slice(0, 80));

const content = await exec.execute({ id: 'b2', name: 'browser', input: { action: 'content' } });
check('content returns html-ish output', !content.isError && content.content.length > 0, `${content.content.length} chars`);

const shotPath = join(sandbox, 'shot.png');
const shot = await exec.execute({ id: 'b3', name: 'browser', input: { action: 'screenshot', path: shotPath } });
check('screenshot ok',                  !shot.isError, shot.content.slice(0, 80));
check('screenshot file exists on disk', existsSync(shotPath), existsSync(shotPath) ? `${statSync(shotPath).size} bytes` : 'missing');

const close = await exec.execute({ id: 'b4', name: 'browser', input: { action: 'close' } });
check('close returns ok',               !close.isError, close.content.slice(0, 80));

// Re-goto after close should still work (browser auto-relaunches).
const goto2 = await exec.execute({ id: 'b5', name: 'browser', input: { action: 'goto', url: 'about:blank' } });
check('goto after close (auto-relaunch)', !goto2.isError);
await exec.execute({ id: 'b6', name: 'browser', input: { action: 'close' } });

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
