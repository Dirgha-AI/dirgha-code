/**
 * `dirgha login --provider=<name>` BYOK flow.
 *
 * Drives the subcommand against a sandboxed HOME so the user's real
 * keys.json is never touched. `--key=<value>` skips the interactive
 * prompt so the test runs offline + deterministic.
 *
 * Verifies:
 *   - `--provider=openrouter --key=sk-or-…` writes OPENROUTER_API_KEY
 *   - subsequent login overwrites the same key
 *   - file exists at ~/.dirgha/keys.json
 *   - file is created mode 0600 on POSIX
 *   - unknown provider rejected
 *   - implausibly short key rejected
 *   - hydration: a fresh `dirgha keys list` finds the new key
 */

import { mkdtempSync, mkdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sandbox = mkdtempSync(join(tmpdir(), 'login-byok-test-'));
const fakeHome = join(sandbox, 'home');
mkdirSync(fakeHome, { recursive: true });

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../../dist_v2/cli/main.js');

function run(args) {
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
  const res = spawnSync('node', [BIN, ...args], { env, encoding: 'utf8' });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

const keysPath = join(fakeHome, '.dirgha', 'keys.json');

console.log('\n=== login --provider=openrouter --key=… writes the key ===');
const r1 = run(['login', '--provider=openrouter', '--key=sk-or-1234567890']);
check('exits 0',                          r1.status === 0);
check('keys.json exists',                  existsSync(keysPath));
const after1 = JSON.parse(readFileSync(keysPath, 'utf8'));
check('OPENROUTER_API_KEY stored',         after1.OPENROUTER_API_KEY === 'sk-or-1234567890');

console.log('\n=== login: subsequent run overwrites ===');
const r2 = run(['login', '--provider=openrouter', '--key=sk-or-NEWVALUE12345']);
check('exits 0',                          r2.status === 0);
const after2 = JSON.parse(readFileSync(keysPath, 'utf8'));
check('value updated',                    after2.OPENROUTER_API_KEY === 'sk-or-NEWVALUE12345');

console.log('\n=== login: file mode is 0600 (POSIX) ===');
if (process.platform !== 'win32') {
  const st = statSync(keysPath);
  const mode = st.mode & 0o777;
  check('mode = 0600',                    mode === 0o600, `mode=${mode.toString(8)}`);
} else {
  console.log('  (skipped on win32)');
}

console.log('\n=== login: unknown provider rejected ===');
const r3 = run(['login', '--provider=mystery', '--key=xxxxxx']);
check('unknown provider exits non-zero',   r3.status !== 0);
check('error mentions known providers',    /Known:/.test(r3.stdout) || /Known:/.test(r3.stderr));

console.log('\n=== login: implausibly short key rejected ===');
const r4 = run(['login', '--provider=nvidia', '--key=ab']);
check('short key exits non-zero',          r4.status !== 0);
check('error mentions short',              /short/.test(r4.stdout) || /short/.test(r4.stderr));

console.log('\n=== login: stored key is visible to `dirgha keys list` ===');
const r5 = run(['keys', 'list']);
check('keys list exits 0',                 r5.status === 0);
check('OPENROUTER_API_KEY shown as stored', /OPENROUTER_API_KEY[\s\S]+stored/.test(r5.stdout));

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
