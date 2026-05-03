/**
 * Workspace state probe — reads `git` output to surface what the user's
 * tree looks like RIGHT NOW (branch, dirty files, recent commits, last
 * staged diff). Composed into the system prompt so the model doesn't
 * have to call `git_status` on every turn just to orient itself.
 *
 * Everything is best-effort: not a git repo → empty result, no crash.
 * Capped sizes so a wild diff can't blow the context.
 */

import { execFileSync } from "node:child_process";

export interface GitState {
  inRepo: boolean;
  branch?: string;
  dirty?: string[]; // `git status --short` lines, capped
  recent?: string[]; // last N commit subjects
  staged?: string; // truncated `git diff --cached`
}

const SHORT_STATUS_CAP_LINES = 30;
const RECENT_COMMITS = 5;
const STAGED_DIFF_CAP = 4_000;

// NOTE: execFileSync is used intentionally — `probeGitState` is called
// during sync system-prompt construction at boot. The blocking is at
// most a few ms for a local repo. Consider an async variant in the
// future for callers that can defer git-state to after the first turn.
function run(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

export function probeGitState(cwd: string): GitState {
  // `git rev-parse --is-inside-work-tree` is the cheapest way to detect a repo.
  const inside = run(["rev-parse", "--is-inside-work-tree"], cwd).trim();
  if (inside !== "true") return { inRepo: false };

  const branch =
    run(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim() || "HEAD";
  const dirtyLines = run(["status", "--short"], cwd)
    .split("\n")
    .filter(Boolean)
    .slice(0, SHORT_STATUS_CAP_LINES);
  const recent = run(
    ["log", `-n`, String(RECENT_COMMITS), "--format=%h %s"],
    cwd,
  )
    .split("\n")
    .filter(Boolean);
  let staged = run(["diff", "--cached", "--no-color"], cwd);
  if (staged.length > STAGED_DIFF_CAP)
    staged = `${staged.slice(0, STAGED_DIFF_CAP)}\n[...staged diff truncated to 4 KB...]`;

  return {
    inRepo: true,
    branch,
    dirty: dirtyLines,
    recent,
    staged: staged || undefined,
  };
}

/**
 * Render a GitState as a compact `<git_state>` block suitable for
 * splicing into the system prompt. Returns '' when the cwd is not a
 * git repo, so callers can blindly concat.
 */
export function renderGitState(state: GitState): string {
  if (!state.inRepo) return "";
  const lines: string[] = ["<git_state>"];
  lines.push(`branch: ${state.branch ?? "unknown"}`);
  if (state.dirty && state.dirty.length > 0) {
    lines.push(
      `dirty (${state.dirty.length} file${state.dirty.length === 1 ? "" : "s"}):`,
    );
    for (const l of state.dirty) lines.push(`  ${l}`);
  } else {
    lines.push("dirty: clean");
  }
  if (state.recent && state.recent.length > 0) {
    lines.push("recent commits:");
    for (const l of state.recent) lines.push(`  ${l}`);
  }
  if (state.staged && state.staged.trim().length > 0) {
    lines.push("staged diff:");
    lines.push(state.staged.trim());
  }
  lines.push("</git_state>");
  return lines.join("\n");
}
