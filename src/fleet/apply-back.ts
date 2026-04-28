/**
 * fleet/apply-back.ts — Land a worktree's changes back into the parent
 * working tree.
 *
 * Three strategies:
 *   - '3way' (default) — commit in worktree, `git diff base..HEAD`, then
 *     `git apply --3way` to the parent tree so the user reviews as
 *     UNSTAGED changes. Reversible; conflict markers are produced in
 *     files on mismatch rather than failing outright.
 *
 *   - 'merge' — `git merge --no-ff <branch>` on the parent. Leaves a
 *     merge commit. Use when you want the history.
 *
 *   - 'cherry-pick' — `git cherry-pick <base>..<HEAD>` replays every
 *     commit from the worktree onto the parent HEAD.
 *
 * Returns structured ApplyResult; does NOT throw on merge conflicts —
 * caller inspects `conflicts`/`success` and decides.
 */

import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { getRepoRoot, getHeadSha } from './worktree.js';
import type { ApplyOptions, ApplyResult, WorktreeHandle } from './types.js';

const pexec = promisify(execFile);

const MAX_DIFF_BYTES = 50 * 1024 * 1024;

/**
 * Apply a worktree's changes back to the parent working tree.
 *
 * The worktree is expected to be in a clean-or-dirty state; any dirty
 * changes are staged + committed transparently before the apply.
 */
export async function applyBack(
  worktree: WorktreeHandle,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const strategy = options.strategy ?? '3way';
  const repoRoot = options.repoRoot ?? await getRepoRoot(worktree.repoRoot);
  const message = options.message ?? `fleet: ${worktree.branch.split('/').pop() ?? 'agent'}`;

  try {
    await commitDirty(worktree, message);
  } catch (err) {
    return fail(strategy, `commit failed: ${errMsg(err)}`);
  }

  switch (strategy) {
    case '3way': return apply3way(worktree, repoRoot, options.paths);
    case 'merge': return applyMerge(worktree, repoRoot);
    case 'cherry-pick': return applyCherryPick(worktree, repoRoot);
  }
}

/** Commit every dirty file in the worktree (stage+commit). */
async function commitDirty(worktree: WorktreeHandle, message: string): Promise<void> {
  await pexec('git', ['add', '-A'], { cwd: worktree.path });
  const { stdout } = await pexec('git', ['status', '--porcelain'], { cwd: worktree.path });
  if (!stdout.trim()) return;
  await pexec('git', ['commit', '-m', message, '--allow-empty'], { cwd: worktree.path });
}

/* -------------------------- 3-way apply -------------------------- */

async function apply3way(
  worktree: WorktreeHandle,
  repoRoot: string,
  pathsFilter: string[] | undefined,
): Promise<ApplyResult> {
  const parentHead = await getHeadSha(repoRoot);

  let diff = '';
  try {
    const args = ['diff', parentHead, 'HEAD'];
    if (pathsFilter && pathsFilter.length > 0) {
      args.push('--', ...pathsFilter);
    }
    const { stdout } = await pexec('git', args, {
      cwd: worktree.path,
      maxBuffer: MAX_DIFF_BYTES,
    });
    diff = stdout;
  } catch (err) {
    return fail('3way', `diff failed: ${errMsg(err)}`);
  }

  if (!diff.trim()) {
    return { success: true, strategy: '3way', appliedFiles: [], conflicts: [] };
  }

  const appliedFiles = extractDiffPaths(diff);
  const patchPath = join(tmpdir(), `fleet-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);
  await writeFile(patchPath, diff, 'utf8');

  try {
    await pexec('git', ['apply', '--3way', patchPath], { cwd: repoRoot });
    return { success: true, strategy: '3way', appliedFiles, conflicts: [] };
  } catch (err) {
    const stderr = extractStderr(err);
    const conflicts = extractConflicts(stderr);
    return {
      success: conflicts.length === 0 && !stderr,
      strategy: '3way',
      appliedFiles,
      conflicts,
      error: conflicts.length > 0 ? `${conflicts.length} conflict(s)` : stderr.slice(0, 500),
    };
  } finally {
    try { await unlink(patchPath); } catch { /* best effort */ }
  }
}

/* --------------------------- Merge -------------------------------- */

async function applyMerge(worktree: WorktreeHandle, repoRoot: string): Promise<ApplyResult> {
  try {
    await pexec('git', ['merge', '--no-ff', '--no-edit', worktree.branch], { cwd: repoRoot });
    // Diff the just-created merge commit vs its first parent.
    const { stdout } = await pexec('git', ['diff', '--name-only', 'HEAD~1..HEAD'], { cwd: repoRoot });
    const appliedFiles = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    return { success: true, strategy: 'merge', appliedFiles, conflicts: [] };
  } catch (err) {
    const stderr = extractStderr(err);
    const conflicts = extractConflicts(stderr);
    return {
      success: false,
      strategy: 'merge',
      appliedFiles: [],
      conflicts,
      error: stderr.slice(0, 500) || errMsg(err),
    };
  }
}

/* ---------------------- Cherry-pick range ------------------------- */

async function applyCherryPick(worktree: WorktreeHandle, repoRoot: string): Promise<ApplyResult> {
  try {
    const parentHead = await getHeadSha(repoRoot);
    const { stdout: revList } = await pexec(
      'git',
      ['rev-list', `${parentHead}..HEAD`],
      { cwd: worktree.path },
    );
    const shas = revList.split('\n').map(s => s.trim()).filter(Boolean).reverse();
    if (shas.length === 0) {
      return { success: true, strategy: 'cherry-pick', appliedFiles: [], conflicts: [] };
    }
    await pexec('git', ['cherry-pick', ...shas], { cwd: repoRoot });
    const { stdout } = await pexec('git', ['diff', '--name-only', `HEAD~${shas.length}..HEAD`], { cwd: repoRoot });
    const appliedFiles = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    return { success: true, strategy: 'cherry-pick', appliedFiles, conflicts: [] };
  } catch (err) {
    const stderr = extractStderr(err);
    const conflicts = extractConflicts(stderr);
    return {
      success: false,
      strategy: 'cherry-pick',
      appliedFiles: [],
      conflicts,
      error: stderr.slice(0, 500) || errMsg(err),
    };
  }
}

/* ---------------------------- helpers ----------------------------- */

function extractDiffPaths(diff: string): string[] {
  const seen = new Set<string>();
  for (const m of diff.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)) {
    seen.add(m[2] ?? m[1] ?? '');
  }
  return [...seen].filter(Boolean);
}

function extractConflicts(stderr: string): string[] {
  const conflicts = new Set<string>();
  for (const m of stderr.matchAll(/conflict(?: in| :)? (.+?)(?:\n|$)/gi)) {
    conflicts.add(m[1]!.trim());
  }
  for (const m of stderr.matchAll(/CONFLICT .+? in (.+?)\n/g)) {
    conflicts.add(m[1]!.trim());
  }
  return [...conflicts];
}

function extractStderr(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown };
    if (typeof e.stderr === 'string') return e.stderr;
    if (Buffer.isBuffer(e.stderr)) return e.stderr.toString('utf8');
    if (typeof e.stdout === 'string') return e.stdout;
    if (typeof e.message === 'string') return e.message;
  }
  return String(err);
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function fail(strategy: ApplyResult['strategy'], error: string): ApplyResult {
  return { success: false, strategy, appliedFiles: [], conflicts: [], error };
}
