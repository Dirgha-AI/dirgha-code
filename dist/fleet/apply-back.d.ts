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
import type { ApplyOptions, ApplyResult, WorktreeHandle } from "./types.js";
/**
 * Apply a worktree's changes back to the parent working tree.
 *
 * The worktree is expected to be in a clean-or-dirty state; any dirty
 * changes are staged + committed transparently before the apply.
 */
export declare function applyBack(worktree: WorktreeHandle, options?: ApplyOptions): Promise<ApplyResult>;
