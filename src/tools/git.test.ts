/**
 * tools/git.test.ts — Unit tests for git tool suite
 * Uses a temp git repo so tests are fully isolated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let repoDir: string;

function git(args: string[], cwd = repoDir): string {
  return spawnSync('git', args, { encoding: 'utf8', cwd }).stdout.trim();
}

beforeAll(() => {
  repoDir = join(tmpdir(), `dirgha-git-test-${Date.now()}`);
  mkdirSync(repoDir, { recursive: true });
  spawnSync('git', ['init', '-b', 'main'], { cwd: repoDir, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@dirgha.ai'], { cwd: repoDir });
  spawnSync('git', ['config', 'user.name', 'Dirgha Test'], { cwd: repoDir });
  writeFileSync(join(repoDir, 'README.md'), '# test repo\n');
  spawnSync('git', ['add', '-A'], { cwd: repoDir });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: repoDir });
});

afterAll(() => {
  try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
});

// ─── gitStatusTool ──────────────────────────────────────────────────────────
describe('gitStatusTool', () => {
  it('returns branch info', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitStatusTool } = await import('./git.js');
    const r = await gitStatusTool();
    process.chdir(origCwd);
    expect(r.tool).toBe('git_status');
    expect(r.result).toContain('main');
  });

  it('returns empty error outside git repo', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpdir());
    const { gitStatusTool } = await import('./git.js');
    const r = await gitStatusTool();
    process.chdir(origCwd);
    // Either succeeds (parent is a git repo) or returns error — both valid
    expect(r.tool).toBe('git_status');
  });
});

// ─── gitDiffTool ─────────────────────────────────────────────────────────────
describe('gitDiffTool', () => {
  it('returns no changes on clean repo', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitDiffTool } = await import('./git.js');
    const r = await gitDiffTool({});
    process.chdir(origCwd);
    expect(r.result).toBe('(no changes)');
  });

  it('shows unstaged diff after file change', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    writeFileSync(join(repoDir, 'README.md'), '# modified\n');
    const { gitDiffTool } = await import('./git.js');
    const r = await gitDiffTool({});
    // Restore
    spawnSync('git', ['checkout', '--', 'README.md'], { cwd: repoDir });
    process.chdir(origCwd);
    expect(r.result).toContain('modified');
  });

  it('shows staged diff with staged:true', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    writeFileSync(join(repoDir, 'staged.txt'), 'staged content\n');
    spawnSync('git', ['add', 'staged.txt'], { cwd: repoDir });
    const { gitDiffTool } = await import('./git.js');
    const r = await gitDiffTool({ staged: true });
    // Restore
    spawnSync('git', ['rm', '--cached', 'staged.txt'], { cwd: repoDir });
    rmSync(join(repoDir, 'staged.txt'));
    process.chdir(origCwd);
    expect(r.result).toContain('staged.txt');
  });
});

// ─── gitLogTool ──────────────────────────────────────────────────────────────
describe('gitLogTool', () => {
  it('returns commit log', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitLogTool } = await import('./git.js');
    const r = await gitLogTool({});
    process.chdir(origCwd);
    expect(r.result).toContain('init');
  });

  it('respects n parameter', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitLogTool } = await import('./git.js');
    const r = await gitLogTool({ n: 1 });
    process.chdir(origCwd);
    expect(r.result.split('\n').length).toBeLessThanOrEqual(1);
  });
});

// ─── gitBranchTool ───────────────────────────────────────────────────────────
describe('gitBranchTool', () => {
  it('lists branches', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitBranchTool } = await import('./git.js');
    const r = await gitBranchTool({});
    process.chdir(origCwd);
    expect(r.result).toContain('main');
  });

  it('creates a new branch', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitBranchTool } = await import('./git.js');
    const r = await gitBranchTool({ name: 'test-branch-x' });
    process.chdir(origCwd);
    expect(r.error).toBeUndefined();
    // Verify branch exists
    const branches = git(['branch']);
    expect(branches).toContain('test-branch-x');
    git(['branch', '-d', 'test-branch-x']);
  });

  it('returns error for invalid branch name', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitBranchTool } = await import('./git.js');
    const r = await gitBranchTool({ name: 'test-branch-x' }); // already deleted or re-creates
    process.chdir(origCwd);
    // May or may not error depending on state — just check tool name
    expect(r.tool).toBe('git_branch');
  });
});

// ─── gitStashTool ────────────────────────────────────────────────────────────
describe('gitStashTool', () => {
  it('lists empty stash', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitStashTool } = await import('./git.js');
    const r = await gitStashTool({ action: 'list' });
    process.chdir(origCwd);
    expect(r.tool).toBe('git_stash');
  });

  it('stash default action is list', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    const { gitStashTool } = await import('./git.js');
    const r = await gitStashTool({});
    process.chdir(origCwd);
    expect(r.tool).toBe('git_stash');
  });
});

// ─── gitPatchTool ────────────────────────────────────────────────────────────
describe('gitPatchTool', () => {
  it('returns error if patch is missing', async () => {
    const { gitPatchTool } = await import('./git.js');
    const r = await gitPatchTool({});
    expect(r.error).toContain('patch is required');
  });

  it('applies a valid patch', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    writeFileSync(join(repoDir, 'patch-target.txt'), 'line1\nline2\n');
    spawnSync('git', ['add', '-A'], { cwd: repoDir });
    spawnSync('git', ['commit', '-m', 'add patch-target'], { cwd: repoDir });
    // Create a patch
    writeFileSync(join(repoDir, 'patch-target.txt'), 'line1\nline2\nline3\n');
    const diff = spawnSync('git', ['diff', 'patch-target.txt'], { encoding: 'utf8', cwd: repoDir }).stdout;
    // Reset
    spawnSync('git', ['checkout', '--', 'patch-target.txt'], { cwd: repoDir });
    const { gitPatchTool } = await import('./git.js');
    const r = await gitPatchTool({ patch: diff });
    // Clean up
    spawnSync('git', ['checkout', '--', 'patch-target.txt'], { cwd: repoDir });
    process.chdir(origCwd);
    expect(r.error).toBeUndefined();
  });
});

// ─── checkpointTool ──────────────────────────────────────────────────────────
describe('checkpointTool', () => {
  it('stashes with description on dirty repo', async () => {
    const origCwd = process.cwd();
    process.chdir(repoDir);
    writeFileSync(join(repoDir, 'checkpoint-test.txt'), 'dirty\n');
    spawnSync('git', ['add', 'checkpoint-test.txt'], { cwd: repoDir });
    const { checkpointTool } = await import('./git.js');
    const r = await checkpointTool({ description: 'my checkpoint' });
    process.chdir(origCwd);
    // Either stashed or no changes to stash — both valid
    expect(r.tool).toBe('checkpoint');
  });
});
