/**
 * fleet/worktree.ts — Create, destroy, and list git worktrees.
 *
 * We always shell out via execFile with argv arrays (never a shell string),
 * so branch names and paths containing special characters are safe.
 *
 * Layout:
 *   <repo-root>/<worktreeBase>/<slug(branch)>/
 *
 * Branch naming convention for fleet:
 *   fleet/<goal-slug>/<subtask-id>
 *
 * Worktrees are registered on process exit so SIGINT doesn't leave them
 * stranded — see registerExitCleanup().
 */
import type { WorktreeHandle } from './types.js';
/** Slug: lowercase alphanumerics + hyphens, bounded length. */
export declare function slug(input: string, maxLen?: number): string;
/** Find the git repo root (via `git rev-parse --show-toplevel`). Throws if not in a repo. */
export declare function getRepoRoot(cwd?: string): Promise<string>;
/** Get current HEAD commit SHA for a given working directory. */
export declare function getHeadSha(cwd: string): Promise<string>;
export interface CreateWorktreeOptions {
    repoRoot: string;
    /** Base directory under repoRoot (default `.fleet`). */
    worktreeBase?: string;
    /** Base ref for the new branch. Default: `HEAD`. */
    base?: string;
    /** If the branch already exists, check it out instead of `-b`-creating. */
    reuseBranch?: boolean;
}
/**
 * Create a new worktree on a fresh branch off `base` (default HEAD).
 *
 * Idempotent: if the target path already exists and git already knows
 * about it, we return the existing handle instead of failing.
 */
export declare function createWorktree(branch: string, opts: CreateWorktreeOptions): Promise<WorktreeHandle>;
/** Remove a worktree. Falls back to `rm -rf` if git refuses. */
export declare function destroyWorktree(handle: WorktreeHandle, force?: boolean): Promise<void>;
/** Delete a local branch. Silent on failure. */
export declare function deleteBranch(repoRoot: string, branch: string, force?: boolean): Promise<void>;
/** List all git worktrees attached to this repo. Includes the primary. */
export declare function listWorktrees(repoRoot: string): Promise<WorktreeHandle[]>;
/** Public for testing — parse `git worktree list --porcelain`. */
export declare function parseWorktreePorcelain(stdout: string, repoRoot: string): WorktreeHandle[];
/**
 * Make fleet-owned worktrees immune to cleanup. Useful after a successful
 * apply-back when the user wants to keep the branch for review.
 */
export declare function detachFromCleanup(h: WorktreeHandle): void;
