/**
 * Workspace state probe — reads `git` output to surface what the user's
 * tree looks like RIGHT NOW (branch, dirty files, recent commits, last
 * staged diff). Composed into the system prompt so the model doesn't
 * have to call `git_status` on every turn just to orient itself.
 *
 * Everything is best-effort: not a git repo → empty result, no crash.
 * Capped sizes so a wild diff can't blow the context.
 */
export interface GitState {
    inRepo: boolean;
    branch?: string;
    dirty?: string[];
    recent?: string[];
    staged?: string;
}
export declare function probeGitState(cwd: string): GitState;
/**
 * Render a GitState as a compact `<git_state>` block suitable for
 * splicing into the system prompt. Returns '' when the cwd is not a
 * git repo, so callers can blindly concat.
 */
export declare function renderGitState(state: GitState): string;
