/**
 * `dirgha skills install/uninstall` smoke. Spawns the subcommand
 * against a sandboxed HOME so the real ~/.dirgha is untouched, and
 * uses a local "remote" git repo (file://) so install runs offline.
 *
 * Verifies:
 *   - install <url> clones into ~/.dirgha/skills/<derived-name>
 *   - install <url> <name> uses the explicit name
 *   - install rejects an existing target without --force
 *   - install rejects a clone that doesn't contain a SKILL.md
 *   - uninstall removes the directory
 *   - uninstall on a missing skill exits non-zero
 *   - install rejects an invalid name pattern
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../../dist_v2/cli/main.js');

const sandbox = mkdtempSync(join(tmpdir(), 'skills-install-test-'));
const fakeHome = join(sandbox, 'home');
mkdirSync(fakeHome, { recursive: true });

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

function makeFakeRemote(name, withSkill) {
  const repo = join(sandbox, `remote-${name}`);
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@dirgha');
  git('config', 'user.name', 'test');
  if (withSkill) {
    writeFileSync(join(repo, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n\nDo something useful.\n`);
  } else {
    writeFileSync(join(repo, 'README.md'), '# no skill here\n');
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return repo;
}

function runSkills(args) {
  const env = { ...process.env, HOME: fakeHome };
  const res = spawnSync('node',
    [BIN, 'skills', ...args],
    { env, encoding: 'utf8' });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

console.log('\n=== skills install: clones a remote with a SKILL.md ===');
const goodRemote = makeFakeRemote('helper', true);
const r1 = runSkills(['install', `file://${goodRemote}`]);
check('install exits 0',                        r1.status === 0);
check('skill dir created',                      existsSync(join(fakeHome, '.dirgha', 'skills', 'remote-helper')));
check('SKILL.md present at target',             existsSync(join(fakeHome, '.dirgha', 'skills', 'remote-helper', 'SKILL.md')));
check('install confirms via stdout',            /installed/.test(r1.stdout) || /helper/.test(r1.stdout));

console.log('\n=== skills install: explicit name ===');
const remote2 = makeFakeRemote('lint', true);
const r2 = runSkills(['install', `file://${remote2}`, 'my-linter']);
check('install <url> <name> exits 0',           r2.status === 0);
check('skill dir uses explicit name',           existsSync(join(fakeHome, '.dirgha', 'skills', 'my-linter')));

console.log('\n=== skills install: existing target rejected ===');
const r3 = runSkills(['install', `file://${remote2}`, 'my-linter']);
check('repeat install exits non-zero',          r3.status !== 0);
check('error mentions already installed',        /already installed/.test(r3.stderr));

console.log('\n=== skills install: clone without SKILL.md rejected ===');
const badRemote = makeFakeRemote('not-a-skill', false);
const r4 = runSkills(['install', `file://${badRemote}`]);
check('no-SKILL.md install exits non-zero',     r4.status !== 0);
// Directory may or may not be kept depending on impl; just check the warning.
check('error mentions no SKILL.md',              /no SKILL\.md/.test(r4.stderr));

console.log('\n=== skills install: invalid name rejected ===');
const r5 = runSkills(['install', `file://${goodRemote}`, 'bad name with spaces']);
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
