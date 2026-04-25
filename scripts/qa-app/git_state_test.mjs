/**
 * Workspace git_state probe smoke. Drives `context/git-state.ts`
 * against a sandboxed git repo so the test never touches the real
 * working tree.
 *
 * Verifies:
 *   - probeGitState returns inRepo=false outside a git repo
 *   - inside a repo, returns branch + dirty + recent-commits + staged
 *   - renderGitState produces a `<git_state>` block when inRepo=true
 *   - renderGitState returns '' when inRepo=false (caller can blindly concat)
 *   - composeSystemPrompt accepts the gitState section and orders it
 *     after the primer
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { probeGitState, renderGitState } = await import(`${ROOT}/context/git-state.js`);
const { composeSystemPrompt } = await import(`${ROOT}/context/primer.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const sandbox = mkdtempSync(join(tmpdir(), 'gitstate-test-'));
const notRepo = join(sandbox, 'no-repo');
mkdirSync(notRepo, { recursive: true });

console.log('\n=== git_state: outside a repo ===');
const outsideState = probeGitState(notRepo);
check('inRepo=false',                     outsideState.inRepo === false);
check('branch absent',                    outsideState.branch === undefined);
check('renderGitState returns empty',     renderGitState(outsideState) === '');

console.log('\n=== git_state: inside a fresh repo ===');
const repo = join(sandbox, 'repo');
mkdirSync(repo, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'test@dirgha');
git('config', 'user.name',  'test');
writeFileSync(join(repo, 'README.md'), 'hello\n');
git('add', 'README.md');
git('commit', '-q', '-m', 'initial commit');
writeFileSync(join(repo, 'index.ts'), 'export const x = 1;\n');
git('add', 'index.ts');
writeFileSync(join(repo, 'dirty.ts'), 'export const y = 2;\n'); // unstaged
writeFileSync(join(repo, 'README.md'), 'hello there\n');         // unstaged modify

const state = probeGitState(repo);
check('inRepo=true',                      state.inRepo === true);
check('branch=main',                       state.branch === 'main');
check('recent has the initial commit',    Array.isArray(state.recent) && state.recent.some(l => /initial commit/.test(l)));
check('dirty has 2 files',                Array.isArray(state.dirty) && state.dirty.length >= 2);
check('staged diff includes index.ts',    typeof state.staged === 'string' && /index\.ts/.test(state.staged));

console.log('\n=== git_state: rendered block shape ===');
const rendered = renderGitState(state);
check('starts with <git_state>',          rendered.startsWith('<git_state>'));
check('closes with </git_state>',          rendered.trim().endsWith('</git_state>'));
check('includes branch line',             /branch: main/.test(rendered));
check('includes dirty section',           /dirty/.test(rendered));
check('includes recent commits section',   /recent commits/.test(rendered));
check('includes staged diff section',     /staged diff/.test(rendered));

console.log('\n=== composeSystemPrompt: orders sections correctly ===');
const composed = composeSystemPrompt({
  modePreamble: 'Mode: ACT.',
  primer: 'Project Bucky.',
  gitState: rendered,
  userSystem: 'extra',
});
const idxMode = composed.indexOf('Mode: ACT');
const idxPrimer = composed.indexOf('<project_primer>');
const idxGit = composed.indexOf('<git_state>');
const idxUser = composed.indexOf('extra');
check('mode comes first',                 idxMode === 0);
check('primer before git_state',          idxPrimer < idxGit);
check('git_state before userSystem',      idxGit < idxUser);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
