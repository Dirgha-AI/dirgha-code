/**
 * fleet/cli-command.ts — Fleet dispatch for v2's slash + CLI flow.
 *
 * Exports three entry points so the host can plug in whichever fits:
 *
 *   1. fleetCommand(argv, env) — call from main.ts when positionals[0] === 'fleet'.
 *      Handles all subcommands non-interactively, writes to stdout/stderr,
 *      returns exit code.
 *
 *   2. registerFleetSlash(slashRegistry, opts) — register `/fleet`, `/triple`,
 *      `/worktrees` so the interactive REPL picks them up.
 *
 *   3. The default export `fleetCommand` is a thin façade matching the
 *      integration contract specified by the spec.
 *
 * Subcommands:
 *   fleet launch <goal…>       — decompose + spawn agents in worktrees
 *   fleet list                 — list active fleet worktrees
 *   fleet merge <branch>       — applyBack (3-way by default)
 *   fleet discard <branch>     — destroyWorktree + deleteBranch
 *   fleet triple <goal…>       — tripleshot + judge
 *   fleet cleanup              — remove every fleet/ worktree
 */
import type { ApplyStrategy, WorktreeHandle } from './types.js';
import type { SlashRegistry } from '../cli/slash.js';
export interface FleetCommandOptions {
    cwd?: string;
    model?: string;
    plannerModel?: string;
    verbose?: boolean;
    json?: boolean;
    autoMerge?: boolean;
    strategy?: ApplyStrategy;
    maxTurns?: number;
    concurrency?: number;
    timeoutMs?: number;
}
/**
 * Entry point for `dirgha fleet …` — returns a POSIX exit code.
 * `argv` is the list of tokens AFTER the `fleet` verb.
 */
export declare function fleetCommand(argv: string[], opts?: FleetCommandOptions): Promise<number>;
export interface SlashOptions {
    cwd?: string;
    model?: string;
    plannerModel?: string;
}
/**
 * Register /fleet, /triple and /worktrees in a SlashRegistry.
 * The handlers call through to fleetCommand; their return value is the
 * text the REPL prints.
 */
export declare function registerFleetSlash(registry: SlashRegistry, opts?: SlashOptions): void;
/**
 * Public helper for callers who want to build worktrees by hand
 * (e.g. scripts wrapping fleet).
 */
export declare function openWorktreeByBranch(branch: string, opts?: {
    repoRoot?: string;
    cwd?: string;
}): Promise<WorktreeHandle>;
