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
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
const pexec = promisify(execFile);
/** Slug: lowercase alphanumerics + hyphens, bounded length. */
export function slug(input, maxLen = 40) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, maxLen) || 'task';
}
/** Find the git repo root (via `git rev-parse --show-toplevel`). Throws if not in a repo. */
export async function getRepoRoot(cwd = process.cwd()) {
    try {
        const { stdout } = await pexec('git', ['rev-parse', '--show-toplevel'], { cwd });
        return stdout.trim();
    }
    catch {
        throw new Error('fleet: not inside a git repository — fleet requires a git-tracked project.');
    }
}
/** Get current HEAD commit SHA for a given working directory. */
export async function getHeadSha(cwd) {
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd });
    return stdout.trim();
}
/**
 * Create a new worktree on a fresh branch off `base` (default HEAD).
 *
 * Idempotent: if the target path already exists and git already knows
 * about it, we return the existing handle instead of failing.
 *
 * Stale-branch recovery: if a prior fleet run was killed mid-way, the git
 * branch ref survives even after the worktree directory was cleaned up.
 * We detect this and force-delete the stale ref before re-creating so
 * re-launch of the same goal never fails with "branch already exists".
 */
export async function createWorktree(branch, opts) {
    const { repoRoot } = opts;
    const base = opts.base ?? 'HEAD';
    const worktreeBase = opts.worktreeBase ?? '.fleet';
    const safeName = branch.replace(/\//g, '_');
    const path = join(repoRoot, worktreeBase, safeName);
    if (existsSync(path)) {
        try {
            const baseCommit = await getHeadSha(path);
            const handle = { path, branch, repoRoot, baseCommit };
            trackForCleanup(handle);
            return handle;
        }
        catch {
            // Stale directory — nuke it.
            try {
                rmSync(path, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
    }
    // Ensure stale branch refs from killed prior runs don't block re-launch.
    if (!opts.reuseBranch && await branchExists(repoRoot, branch)) {
        await pruneStaleWorktreeForBranch(repoRoot, branch);
        try {
            await pexec('git', ['branch', '-D', branch], { cwd: repoRoot });
        }
        catch { /* already gone */ }
    }
    const args = opts.reuseBranch
        ? ['worktree', 'add', path, branch]
        : ['worktree', 'add', '-b', branch, path, base];
    await pexec('git', args, { cwd: repoRoot });
    const baseCommit = await getHeadSha(path);
    const handle = { path, branch, repoRoot, baseCommit };
    trackForCleanup(handle);
    return handle;
}
/** Return true if the local branch ref exists. */
async function branchExists(repoRoot, branch) {
    try {
        await pexec('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repoRoot });
        return true;
    }
    catch {
        return false;
    }
}
/** Remove any registered worktree still referencing `branch`, then prune. */
async function pruneStaleWorktreeForBranch(repoRoot, branch) {
    try {
        const { stdout } = await pexec('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot });
        for (const block of stdout.trim().split(/\n\s*\n/)) {
            const wtBranch = (/^branch (.+)$/m.exec(block)?.[1] ?? '').replace(/^refs\/heads\//, '');
            if (wtBranch !== branch)
                continue;
            const wtPath = /^worktree (.+)$/m.exec(block)?.[1] ?? '';
            if (wtPath) {
                try {
                    rmSync(wtPath, { recursive: true, force: true });
                }
                catch { /* best effort */ }
                try {
                    await pexec('git', ['worktree', 'remove', '--force', wtPath], { cwd: repoRoot });
                }
                catch { /* already gone */ }
            }
        }
        await pexec('git', ['worktree', 'prune', '--expire=now'], { cwd: repoRoot });
    }
    catch { /* best effort */ }
}
/** Remove a worktree. Falls back to `rm -rf` if git refuses. */
export async function destroyWorktree(handle, force = false) {
    untrackForCleanup(handle);
    if (!existsSync(handle.path))
        return;
    try {
        const args = ['worktree', 'remove', handle.path];
        if (force)
            args.push('--force');
        await pexec('git', args, { cwd: handle.repoRoot });
    }
    catch {
        try {
            rmSync(handle.path, { recursive: true, force: true });
        }
        catch { /* best effort */ }
    }
    // Best-effort prune of the registered worktree entry.
    try {
        await pexec('git', ['worktree', 'prune'], { cwd: handle.repoRoot });
    }
    catch { /* ignore */ }
}
/** Delete a local branch. Silent on failure. */
export async function deleteBranch(repoRoot, branch, force = false) {
    try {
        await pexec('git', ['branch', force ? '-D' : '-d', branch], { cwd: repoRoot });
    }
    catch { /* not an error — branch may still be in use or already gone */ }
}
/** List all git worktrees attached to this repo. Includes the primary. */
export async function listWorktrees(repoRoot) {
    try {
        const { stdout } = await pexec('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot });
        return parseWorktreePorcelain(stdout, repoRoot);
    }
    catch {
        return [];
    }
}
/** Public for testing — parse `git worktree list --porcelain`. */
export function parseWorktreePorcelain(stdout, repoRoot) {
    const blocks = stdout.trim().split(/\n\s*\n/);
    const out = [];
    for (const block of blocks) {
        const path = /^worktree (.+)$/m.exec(block)?.[1] ?? '';
        const head = /^HEAD (.+)$/m.exec(block)?.[1] ?? '';
        const branch = (/^branch (.+)$/m.exec(block)?.[1] ?? '').replace(/^refs\/heads\//, '');
        if (!path)
            continue;
        out.push({ path, branch: branch || '(detached)', repoRoot, baseCommit: head });
    }
    return out;
}
/* --------------------------------------------------------------------------
 * Exit-cleanup registry: ensures SIGINT / uncaught exceptions don't leave
 * worktrees behind. Managed per-process; idempotent when wired from many
 * callers.
 * -------------------------------------------------------------------------- */
const tracked = new Set();
let exitHandlerInstalled = false;
function trackForCleanup(h) {
    tracked.add(h);
    installExitHandler();
}
function untrackForCleanup(h) {
    tracked.delete(h);
}
function installExitHandler() {
    if (exitHandlerInstalled)
        return;
    exitHandlerInstalled = true;
    // Synchronous cleanup of all tracked worktrees.
    // Called from SIGINT/SIGTERM handlers AND the 'exit' event (idempotent via tracked.clear).
    const cleanup = () => {
        const handles = [...tracked];
        tracked.clear(); // clear first so a re-entrant exit event is a no-op
        for (const h of handles) {
            // `git worktree remove --force` atomically deregisters the worktree from
            // git's internal list AND removes the directory in one call. This avoids
            // the rmSync + prune + branch-D ordering problem (git refuses branch -D
            // on a branch that still has a registered worktree entry, and prune alone
            // requires --expire=now to remove recently-deleted paths immediately).
            try {
                execFileSync('git', ['worktree', 'remove', '--force', h.path], { cwd: h.repoRoot, stdio: 'ignore' });
            }
            catch { /* best effort */ }
            // Fallback in case the path still exists (e.g. worktree remove failed).
            try {
                rmSync(h.path, { recursive: true, force: true });
            }
            catch { /* best effort */ }
            // Branch ref is now deletable since git no longer sees it as checked out.
            try {
                execFileSync('git', ['branch', '-D', h.branch], { cwd: h.repoRoot, stdio: 'ignore' });
            }
            catch { /* best effort */ }
        }
    };
    // SIGINT/SIGTERM: clean up, set the conventional exit code, then let the
    // process exit naturally via the 'exit' event (which calls cleanup again,
    // but tracked is empty so it's a no-op). Avoid re-raising the signal —
    // process.kill(pid, signal) delivers asynchronously, causing re-entrance.
    const sigHandler = (signal) => {
        cleanup();
        process.exitCode = signal === 'SIGINT' ? 130 : 143;
        process.exit();
    };
    process.once('SIGINT', () => sigHandler('SIGINT'));
    process.once('SIGTERM', () => sigHandler('SIGTERM'));
    // 'exit' catches any other termination path (uncaught exception, process.exit()).
    process.once('exit', cleanup);
}
/**
 * Make fleet-owned worktrees immune to cleanup. Useful after a successful
 * apply-back when the user wants to keep the branch for review.
 */
export function detachFromCleanup(h) {
    untrackForCleanup(h);
}
//# sourceMappingURL=worktree.js.map