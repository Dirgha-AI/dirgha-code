/**
 * fleet/worktree.ts — git worktree create/destroy helpers.
 *
 * Worktree layout:
 *   <repo-root>/.fleet/<branch>/  ← git worktree for one sub-agent
 *
 * Branch naming:
 *   fleet/<goal-slug>/<subtask-id>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Slug for a string: lowercase, alphanumeric + hyphens. */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

/** Find git repo root from cwd, or throw. */
export function getRepoRoot(cwd = process.cwd()): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not inside a git repo — fleet requires a git-tracked project.');
  }
}

/**
 * Create a new worktree off the current HEAD.
 * Returns the absolute worktree path.
 */
export function createWorktree(
  branchName: string,
  repoRoot: string,
  worktreeBase = '.fleet',
): string {
  const baseDir = join(repoRoot, worktreeBase);
  const wtPath = join(baseDir, branchName.replace(/\//g, '_'));
  if (existsSync(wtPath)) {
    // Idempotent: if already exists, just return path
    return wtPath;
  }
  // Create worktree on a new branch off HEAD
  execFileSync('git', ['worktree', 'add', '-b', branchName, wtPath], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return wtPath;
}

/** Remove a worktree (both filesystem and git's record). */
export function destroyWorktree(wtPath: string, repoRoot: string, force = false): void {
  if (!existsSync(wtPath)) return;
  try {
    const args = ['worktree', 'remove', wtPath];
    if (force) args.push('--force');
    execFileSync('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    // Fallback: manual cleanup when git refuses
    try { rmSync(wtPath, { recursive: true, force: true }); } catch { /* give up */ }
  }
}

/** List all worktrees attached to this repo. */
export function listWorktrees(repoRoot: string): Array<{ path: string; branch: string; head: string }> {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot, encoding: 'utf8',
    });
    const blocks = out.trim().split('\n\n');
    return blocks.map(b => {
      const path = b.match(/^worktree (.+)$/m)?.[1] ?? '';
      const head = b.match(/^HEAD (.+)$/m)?.[1] ?? '';
      const branch = b.match(/^branch (.+)$/m)?.[1]?.replace('refs/heads/', '') ?? '(detached)';
      return { path, branch, head };
    });
  } catch {
    return [];
  }
}
