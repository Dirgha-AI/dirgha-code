/**
 * fleet/apply-back.ts — Transient-commit 3-way apply-back (maw pattern).
 *
 * After a sub-agent finishes in a worktree:
 *   1. Commit everything inside the worktree (transient commit)
 *   2. Generate a diff against the parent worktree's HEAD
 *   3. `git apply --3way` the diff in the parent worktree — lands as UNSTAGED changes
 *   4. User reviews in normal `git diff` / editor flow
 *
 * Benefits over `git merge`:
 *   - No merge commit, no branch history noise
 *   - 3-way merge handles conflicts automatically when possible
 *   - Unstaged = reversible; user reviews before they `git add`
 *   - Worktree can be discarded after apply-back
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface ApplyBackResult {
  success: boolean;
  appliedFiles: string[];
  conflicts: string[];
  error?: string;
}

/**
 * Commit all changes in the worktree, then apply that diff back to repoRoot
 * as unstaged changes.
 */
export function applyBack(
  worktreePath: string,
  repoRoot: string,
  message = 'fleet: agent work',
): ApplyBackResult {
  // 1. Commit everything in worktree (transient commit)
  try {
    execFileSync('git', ['add', '-A'], { cwd: worktreePath, stdio: 'ignore' });
    // Skip if nothing to commit
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: worktreePath, encoding: 'utf8' });
    if (!status.trim()) {
      return { success: true, appliedFiles: [], conflicts: [], error: 'no changes in worktree' };
    }
    execFileSync('git', ['commit', '-m', message, '--allow-empty'], {
      cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return { success: false, appliedFiles: [], conflicts: [], error: `commit failed: ${err}` };
  }

  // 2. Generate diff: worktree HEAD vs parent HEAD
  let diff = '';
  try {
    // Compute merge-base with the parent's current HEAD
    const parentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    diff = execFileSync('git', ['diff', parentHead, 'HEAD'], {
      cwd: worktreePath, encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    return { success: false, appliedFiles: [], conflicts: [], error: `diff failed: ${err}` };
  }

  if (!diff.trim()) {
    return { success: true, appliedFiles: [], conflicts: [] };
  }

  // 3. Apply with 3-way merge to the parent repoRoot as unstaged
  const patchPath = join(tmpdir(), `fleet-${Date.now()}.patch`);
  writeFileSync(patchPath, diff, 'utf8');
  const applyResult = spawnSync('git', ['apply', '--3way', patchPath], {
    cwd: repoRoot, encoding: 'utf8',
  });
  try { unlinkSync(patchPath); } catch { /* best effort */ }

  // Parse applied + conflicted files
  const appliedFiles = [...diff.matchAll(/^diff --git a\/(.+?) b\//gm)].map(m => m[1]!);
  const conflicts: string[] = [];
  if (applyResult.status !== 0) {
    const stderr = applyResult.stderr ?? '';
    for (const m of stderr.matchAll(/conflict in (.+?)[\n$]/g)) conflicts.push(m[1]!);
    return {
      success: conflicts.length === 0,
      appliedFiles,
      conflicts,
      error: conflicts.length > 0 ? `${conflicts.length} conflicts` : stderr.slice(0, 500),
    };
  }

  return { success: true, appliedFiles, conflicts };
}
