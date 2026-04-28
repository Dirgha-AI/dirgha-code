/**
 * `dirgha skills install/uninstall` smoke. Spawns the subcommand
 * against a sandboxed HOME so the real ~/.dirgha is untouched.
 *
 * The fixture is a plain local directory (no git repo, no file:// URL).
 * `dirgha skills install <absolute-dir>` recursively copies the tree
 * into ~/.dirgha/skills/<name>. This sidesteps Git-for-Windows quirks
 * around `git clone --depth=1 file:///C:/...` so the test runs on
 * every OS without skips.
 *
 * Verifies:
 *   - install <dir> copies into ~/.dirgha/skills/<derived-name>
 *   - install <dir> <name> uses the explicit name
 *   - install rejects an existing target without --force
 *   - install rejects a source that doesn't contain a SKILL.md
 *   - uninstall removes the directory
 *   - uninstall on a missing skill exits non-zero
 *   - install rejects an invalid name pattern
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const BIN = resolve(__dirname, '../../dist/cli/main.js');

const sandbox = mkdtempSync(join(tmpdir(), 'skills-install-test-'));
const fakeHome = join(sandbox, 'home');
mkdirSync(fakeHome, { recursive: true });

let pass = 0, fail = 0;
let lastResult = null;  // captures the most recent runSkills() result
const check = (label, ok, detail) => {
  const tag = ok ? '✓' : '✗';
  console.log(`  ${tag} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok && lastResult) {
    // Dump the spawn outcome on failure so CI tells us what actually happened.
    console.log(`    └ runSkills exit=${lastResult.status}`);
    if (lastResult.stdout) console.log(`    └ stdout: ${lastResult.stdout.slice(0, 600).replace(/\n/g, '\n      ')}`);
    if (lastResult.stderr) console.log(`    └ stderr: ${lastResult.stderr.slice(0, 600).replace(/\n/g, '\n      ')}`);
  }
  ok ? pass++ : fail++;
};

// Build a plain skill source directory (no git). The install code path
// detects an absolute existing directory and recursively copies it.
function makeFakeSource(folder, withSkill) {
  const src = join(sandbox, `src-${folder}`);
  mkdirSync(src, { recursive: true });
  if (withSkill) {
    writeFileSync(
      join(src, 'SKILL.md'),
      `---\nname: ${folder}\ndescription: ${folder} skill\n---\n\n# ${folder}\n\nDo something useful.\n`,
    );
  } else {
    writeFileSync(join(src, 'README.md'), '# no skill here\n');
  }
  return src;
}

function runSkills(args) {
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
  const res = spawnSync('node',
    [BIN, 'skills', ...args],
    { env, encoding: 'utf8' });
  lastResult = { stdout: res.stdout, stderr: res.stderr, status: res.status };
  return lastResult;
}

console.log('\n=== skills install: copies a local dir with a SKILL.md ===');
const goodSource = makeFakeSource('helper', true);
const r1 = runSkills(['install', goodSource]);
check('install exits 0',                        r1.status === 0);
check('skill dir created',                      existsSync(join(fakeHome, '.dirgha', 'skills', 'src-helper')));
check('SKILL.md present at target',             existsSync(join(fakeHome, '.dirgha', 'skills', 'src-helper', 'SKILL.md')));
check('install confirms via stdout',            /installed/.test(r1.stdout) || /helper/.test(r1.stdout));

console.log('\n=== skills install: explicit name ===');
const source2 = makeFakeSource('lint', true);
const r2 = runSkills(['install', source2, 'my-linter']);
check('install <dir> <name> exits 0',           r2.status === 0);
check('skill dir uses explicit name',           existsSync(join(fakeHome, '.dirgha', 'skills', 'my-linter')));

console.log('\n=== skills install: existing target rejected ===');
const r3 = runSkills(['install', source2, 'my-linter']);
check('repeat install exits non-zero',          r3.status !== 0);
check('error mentions already installed',        /already installed/.test(r3.stderr));

console.log('\n=== skills install: source without SKILL.md rejected ===');
const badSource = makeFakeSource('not-a-skill', false);
const r4 = runSkills(['install', badSource]);
check('no-SKILL.md install exits non-zero',     r4.status !== 0);
// Directory may or may not be kept depending on impl; just check the warning.
check('error mentions no SKILL.md',              /no SKILL\.md/.test(r4.stderr));

console.log('\n=== skills install: invalid name rejected ===');
const r5 = runSkills(['install', goodSource, 'bad name with spaces']);
check('invalid name exits non-zero',            r5.status !== 0);
check('error mentions invalid name',            /Invalid skill name/.test(r5.stderr));

console.log('\n=== skills uninstall: removes the directory ===');
const r6 = runSkills(['uninstall', 'my-linter']);
check('uninstall exits 0',                      r6.status === 0);
check('skill dir gone',                         !existsSync(join(fakeHome, '.dirgha', 'skills', 'my-linter')));

console.log('\n=== skills uninstall: missing skill rejected ===');
const r7 = runSkills(['uninstall', 'no-such-skill']);
check('uninstall missing exits non-zero',       r7.status !== 0);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
