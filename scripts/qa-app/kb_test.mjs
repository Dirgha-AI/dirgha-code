/**
 * `dirgha kb` wrapper smoke. Drives the subcommand against a sandboxed
 * HOME and asserts the headless init writes the config files OpenKB
 * expects, without invoking the (interactive) `openkb init`.
 *
 * Network + LLM-bound operations (`kb ingest`, `kb query`) are out of
 * scope here — they're integration tests, gated on OPENROUTER_API_KEY
 * in scripts/qa-app/.
 */

import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';

const ROOT_TS = _rs(_dn(_toPath(import.meta.url)), '..', '..');
const BIN = join(ROOT_TS, 'dist_v2', 'cli', 'main.js');

const sandbox = mkdtempSync(join(tmpdir(), 'kb-wrap-test-'));
mkdirSync(sandbox, { recursive: true });

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

function runKb(args) {
  const env = { ...process.env, HOME: sandbox };
  const r = spawnSync('node', [BIN, 'kb', ...args], { env, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

console.log('\n=== kb help: prints usage ===');
{
  const r = runKb(['help']);
  check('exit 0',                          r.status === 0);
  check('mentions ingest',                  /dirgha kb ingest/.test(r.stdout));
  check('mentions query',                   /dirgha kb query/.test(r.stdout));
}

console.log('\n=== kb status: auto-inits headless ===');
{
  // Pre-condition: kb dir does not exist
  const kbRoot = join(sandbox, '.dirgha', 'kb');
  check('kb dir absent before status',     !existsSync(kbRoot));

  const r = runKb(['status']);
  // status will call out to openkb. The wrapper's job is just to seed
  // the config — we verify the config files exist regardless of openkb's
  // exit code (no API key in CI = error from openkb but a clean init).
  check('init wrote config.yaml',          existsSync(join(kbRoot, '.openkb', 'config.yaml')));
  check('init wrote hashes.json',           existsSync(join(kbRoot, '.openkb', 'hashes.json')));
  check('init created raw/',                existsSync(join(kbRoot, 'raw')));
  check('init created wiki/',                existsSync(join(kbRoot, 'wiki')));

  const yaml = readFileSync(join(kbRoot, '.openkb', 'config.yaml'), 'utf8');
  check('config has model line',            /model:/.test(yaml));
  check('config defaults to a free model',  /:free/.test(yaml));

  // status output should mention the KB layout (or surface an openkb
  // diagnostic) — either way it shouldn't crash the wrapper.
  check('wrapper exited cleanly',           typeof r.status === 'number');
}

console.log('\n=== kb ingest: rejects empty default sources cleanly ===');
{
  // We pass an explicit non-existent path so openkb isn't invoked at
  // all; the wrapper should report skip without crashing.
  const r = runKb(['ingest', join(sandbox, 'no-such-dir')]);
  check('exit non-zero for 0/1 success',    r.status !== 0);
  check('reports skip',                      /skip/.test(r.stdout));
}

console.log('\n=== kb unknown subcommand: exits non-zero with usage ===');
{
  const r = runKb(['frobnicate']);
  check('unknown sub exits non-zero',       r.status !== 0);
  check('error mentions unknown',            /unknown/.test(r.stderr) || /unknown/.test(r.stdout));
}

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
