/**
 * fleet — Parallel multi-agent work in isolated git worktrees.
 *
 * Each agent runs v2's agent-loop inside its own worktree. The parent
 * observes every agent through a single EventStream and can apply the
 * resulting diffs back with 3-way, merge, or cherry-pick strategies.
 *
 *   runFleet({ goal, … })           → N parallel agents decomposed from goal
 *   runTripleshot(goal, …)          → 3 stylistic variants + LLM judge
 *   applyBack(worktree, strategy)   → land diff back in parent tree
 *   createWorktree/destroyWorktree  → low-level worktree lifecycle
 *   fleetCommand(argv, opts)        → CLI dispatch for positional `fleet …`
 *   registerFleetSlash(registry)    → wire /fleet /triple /worktrees in REPL
 */

export * from './types.js';
export {
  createWorktree,
  destroyWorktree,
  deleteBranch,
  listWorktrees,
  getRepoRoot,
  getHeadSha,
  slug,
  detachFromCleanup,
} from './worktree.js';
export { applyBack } from './apply-back.js';
export { runFleet, decomposeGoal } from './runner.js';
export { runTripleshot } from './tripleshot.js';
export type { TripleshotConfig } from './tripleshot.js';
export {
  fleetCommand,
  registerFleetSlash,
  openWorktreeByBranch,
  type FleetCommandOptions,
  type SlashOptions,
} from './cli-command.js';
