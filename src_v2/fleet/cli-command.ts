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

import { createEventStream } from '../kernel/event-stream.js';
import { runFleet } from './runner.js';
import { runTripleshot } from './tripleshot.js';
import { applyBack } from './apply-back.js';
import {
  createWorktree,
  deleteBranch,
  destroyWorktree,
  detachFromCleanup,
  getRepoRoot,
  listWorktrees,
} from './worktree.js';
import type {
  ApplyStrategy,
  FleetConfig,
  FleetResult,
  TripleshotResult,
  WorktreeHandle,
} from './types.js';
import type { SlashHandler, SlashRegistry } from '../cli/slash.js';

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
export async function fleetCommand(
  argv: string[],
  opts: FleetCommandOptions = {},
): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      printHelp();
      return 0;
    case 'launch': return doLaunch(rest, opts);
    case 'triple': return doTriple(rest, opts);
    case 'list': return doList(opts);
    case 'merge': return doMerge(rest, opts);
    case 'discard': return doDiscard(rest, opts);
    case 'cleanup': return doCleanup(opts);
    default:
      process.stderr.write(`fleet: unknown subcommand "${sub}"\n`);
      printHelp();
      return 1;
  }
}

/* ---------------------------- subcommands ------------------------- */

async function doLaunch(argv: string[], opts: FleetCommandOptions): Promise<number> {
  const goal = argv.join(' ').trim();
  if (!goal) {
    process.stderr.write('usage: dirgha fleet launch <goal>\n');
    return 1;
  }
  const events = createEventStream();
  if (opts.verbose) subscribeVerbose(events);
  const config: FleetConfig = {
    goal,
    cwd: opts.cwd ?? process.cwd(),
    model: opts.model,
    plannerModel: opts.plannerModel,
    maxTurns: opts.maxTurns,
    concurrency: opts.concurrency,
    timeoutMs: opts.timeoutMs,
    events,
    verbose: opts.verbose,
  };
  process.stderr.write(`[fleet] decomposing and launching…\n`);
  const result = await runFleet(config);
  emitResult('launch', result, opts);
  return result.failCount > 0 && result.successCount === 0 ? 1 : 0;
}

async function doTriple(argv: string[], opts: FleetCommandOptions): Promise<number> {
  const goal = argv.join(' ').trim();
  if (!goal) {
    process.stderr.write('usage: dirgha fleet triple <goal>\n');
    return 1;
  }
  const events = createEventStream();
  if (opts.verbose) subscribeVerbose(events);
  const result = await runTripleshot(goal, {
    goal,
    cwd: opts.cwd ?? process.cwd(),
    model: opts.model,
    plannerModel: opts.plannerModel,
    maxTurns: opts.maxTurns,
    timeoutMs: opts.timeoutMs,
    events,
    verbose: opts.verbose,
    autoMerge: opts.autoMerge,
  });
  emitTripleshot(result, opts);
  return result.winner ? 0 : 1;
}

async function doList(opts: FleetCommandOptions): Promise<number> {
  const repoRoot = await getRepoRoot(opts.cwd ?? process.cwd());
  const wts = (await listWorktrees(repoRoot)).filter(w => w.branch.startsWith('fleet/'));
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ worktrees: wts }, null, 2)}\n`);
  } else if (wts.length === 0) {
    process.stdout.write('No fleet worktrees.\n');
  } else {
    process.stdout.write(`Fleet worktrees (${wts.length}):\n`);
    for (const w of wts) {
      process.stdout.write(`  ${w.branch.padEnd(50)}  ${w.path}\n`);
    }
  }
  return 0;
}

async function doMerge(argv: string[], opts: FleetCommandOptions): Promise<number> {
  const target = argv[0];
  if (!target) {
    process.stderr.write('usage: dirgha fleet merge <branch|agent-id>\n');
    return 1;
  }
  const repoRoot = await getRepoRoot(opts.cwd ?? process.cwd());
  const wt = (await listWorktrees(repoRoot)).find(
    w => w.branch === target
      || w.branch.endsWith(`/${target}`)
      || w.branch.includes(`/${target}`),
  );
  if (!wt) {
    process.stderr.write(`fleet: no worktree found for "${target}". Try \`dirgha fleet list\`.\n`);
    return 1;
  }
  const result = await applyBack(wt, {
    strategy: opts.strategy ?? '3way',
    message: `fleet: ${target}`,
    repoRoot,
  });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.success) {
    process.stdout.write(
      `Applied ${result.appliedFiles.length} file(s) via ${result.strategy}. Review with \`git diff\`.\n`,
    );
  } else {
    process.stderr.write(`fleet: merge failed — ${result.error ?? 'unknown error'}\n`);
    if (result.conflicts.length) {
      process.stderr.write(`Conflicts:\n${result.conflicts.map(c => `  - ${c}`).join('\n')}\n`);
    }
  }
  return result.success ? 0 : 1;
}

async function doDiscard(argv: string[], opts: FleetCommandOptions): Promise<number> {
  const target = argv[0];
  if (!target) {
    process.stderr.write('usage: dirgha fleet discard <branch|agent-id>\n');
    return 1;
  }
  const repoRoot = await getRepoRoot(opts.cwd ?? process.cwd());
  const wt = (await listWorktrees(repoRoot)).find(
    w => w.branch === target
      || w.branch.endsWith(`/${target}`)
      || w.branch.includes(`/${target}`),
  );
  if (!wt) {
    process.stderr.write(`fleet: no worktree found for "${target}".\n`);
    return 1;
  }
  await destroyWorktree(wt, true);
  await deleteBranch(repoRoot, wt.branch, true);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ discarded: wt.branch, path: wt.path })}\n`);
  } else {
    process.stdout.write(`Discarded ${wt.branch}.\n`);
  }
  return 0;
}

async function doCleanup(opts: FleetCommandOptions): Promise<number> {
  const repoRoot = await getRepoRoot(opts.cwd ?? process.cwd());
  const wts = (await listWorktrees(repoRoot)).filter(w => w.branch.startsWith('fleet/'));
  let removed = 0;
  for (const w of wts) {
    try {
      await destroyWorktree(w, true);
      await deleteBranch(repoRoot, w.branch, true);
      removed++;
    } catch { /* skip */ }
  }
  process.stdout.write(`Removed ${removed}/${wts.length} fleet worktrees.\n`);
  return 0;
}

/* -------------------------- emit helpers -------------------------- */

function emitResult(phase: string, r: FleetResult, opts: FleetCommandOptions): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ phase, result: r }, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `\nFleet done: ${r.successCount}/${r.agents.length} succeeded · ${Math.floor(r.durationMs / 1000)}s\n`,
  );
  for (const a of r.agents) {
    const dot = a.status === 'completed' ? '✓'
             : a.status === 'failed' ? '✗'
             : a.status === 'cancelled' ? '⊘'
             : '·';
    const dur = a.completedAt && a.startedAt
      ? `${Math.floor((a.completedAt - a.startedAt) / 1000)}s`
      : '';
    process.stdout.write(`  ${dot} ${a.subtask.title.padEnd(40)} ${a.branchName.padEnd(30)} ${dur}\n`);
  }
  if (r.failed.length === 0 && r.successCount > 0) {
    process.stdout.write('\nNext:\n  dirgha fleet list\n  dirgha fleet merge <branch>\n  dirgha fleet discard <branch>\n');
  }
}

function emitTripleshot(r: TripleshotResult, opts: FleetCommandOptions): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\nTripleShot: ${r.winner ?? '(none)'}\n`);
  process.stdout.write(`  runner-up: ${r.runnerUp ?? '(none)'}\n`);
  process.stdout.write(`  reason:    ${r.reason}\n`);
  if (r.apply) {
    if (r.apply.success) {
      process.stdout.write(`  applied:   ${r.apply.appliedFiles.length} file(s) via ${r.apply.strategy}\n`);
    } else {
      process.stdout.write(`  apply failed: ${r.apply.error}\n`);
    }
  }
}

function subscribeVerbose(events: ReturnType<typeof createEventStream>): void {
  events.subscribe(ev => {
    if (ev.type === 'text_delta') process.stderr.write(ev.delta);
    else if (ev.type === 'error') process.stderr.write(`\n[err] ${ev.message}\n`);
  });
}

function printHelp(): void {
  process.stdout.write(
    `dirgha fleet — parallel multi-agent work in isolated git worktrees

Usage:
  dirgha fleet launch <goal>      Decompose + spawn agents in worktrees
  dirgha fleet triple <goal>      TripleShot (3 variants + judge)
  dirgha fleet list               List fleet worktrees
  dirgha fleet merge <branch>     Apply worktree diff back (3-way unstaged)
  dirgha fleet discard <branch>   Remove worktree + branch
  dirgha fleet cleanup            Remove every fleet/* worktree

Options (applicable where relevant):
  --model <id>         Model for subagents
  --planner <id>       Model for decomposition + judge
  --concurrency <n>    Max concurrent agents (default 3)
  --max-turns <n>      Per-agent turn cap (default 15)
  --auto-merge         Auto-apply the winner in tripleshot
  --strategy <kind>    3way (default) | merge | cherry-pick
  --verbose            Mirror agent text to stderr
  --json               NDJSON output to stdout
`,
  );
}

/* ------------------------- slash integration ---------------------- */

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
export function registerFleetSlash(
  registry: SlashRegistry,
  opts: SlashOptions = {},
): void {
  const fleetHandler: SlashHandler = async (args) => {
    const captured = captureStdout();
    try {
      await fleetCommand(args, { cwd: opts.cwd, model: opts.model, plannerModel: opts.plannerModel });
    } finally {
      captured.restore();
    }
    return captured.stdout || undefined;
  };

  const tripleHandler: SlashHandler = async (args) => {
    const captured = captureStdout();
    try {
      await fleetCommand(['triple', ...args], {
        cwd: opts.cwd, model: opts.model, plannerModel: opts.plannerModel,
      });
    } finally {
      captured.restore();
    }
    return captured.stdout || undefined;
  };

  const worktreesHandler: SlashHandler = async () => {
    const captured = captureStdout();
    try {
      await fleetCommand(['list'], { cwd: opts.cwd });
    } finally {
      captured.restore();
    }
    return captured.stdout || undefined;
  };

  registry.register('fleet', fleetHandler);
  registry.register('triple', tripleHandler);
  registry.register('worktrees', worktreesHandler);
}

interface StdoutCapture { stdout: string; restore: () => void }

function captureStdout(): StdoutCapture {
  const original = process.stdout.write.bind(process.stdout);
  let buffer = '';
  (process.stdout.write as unknown as (chunk: unknown) => boolean) = ((chunk: unknown): boolean => {
    buffer += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  });
  return {
    get stdout(): string { return buffer; },
    restore(): void {
      process.stdout.write = original;
    },
  };
}

/**
 * Public helper for callers who want to build worktrees by hand
 * (e.g. scripts wrapping fleet).
 */
export async function openWorktreeByBranch(
  branch: string,
  opts: { repoRoot?: string; cwd?: string } = {},
): Promise<WorktreeHandle> {
  const repoRoot = opts.repoRoot ?? await getRepoRoot(opts.cwd ?? process.cwd());
  const existing = (await listWorktrees(repoRoot)).find(w => w.branch === branch);
  if (existing) {
    detachFromCleanup(existing);
    return existing;
  }
  return createWorktree(branch, { repoRoot });
}
