/**
 * fleet/commands.ts — `dirgha fleet` subcommands.
 *
 *   dirgha fleet launch <goal>     — decompose + spawn N agents in worktrees
 *   dirgha fleet list              — list active & completed fleet agents
 *   dirgha fleet merge <agent-id>  — apply-back one agent's diff to main
 *   dirgha fleet cleanup           — remove all fleet worktrees & branches
 */
import chalk from 'chalk';
import type { Command } from 'commander';
import type { AgentOutput } from '../agent/types.js';
import { writeRaw } from '../agent/output.js';
import { decomposeGoal } from './decompose.js';
import { launchFleet } from './runtime.js';
import { listWorktrees, getRepoRoot, destroyWorktree } from './worktree.js';
import { applyBack } from './apply-back.js';
import { tripleShot } from './tripleshot.js';
import { fleetEvents } from './events.js';
import type { FleetAgent, FleetLaunchOptions } from './types.js';
import { getDefaultModel } from '../providers/detection.js';

function emit(out: AgentOutput): void {
  const jsonMode = process.env['DIRGHA_JSON_OUTPUT'] === '1';
  if (jsonMode) {
    writeRaw(JSON.stringify(out, null, 2) + '\n');
    (globalThis as any).__DIRGHA_JSON_NATIVELY_EMITTED__ = true;
  } else {
    process.stdout.write(out.text + '\n');
  }
  if (out.exitCode !== 0) process.exitCode = out.exitCode;
}

function renderAgent(a: FleetAgent): string {
  const dot = a.status === 'running' ? chalk.yellow('◐')
            : a.status === 'completed' ? chalk.green('✓')
            : a.status === 'failed' ? chalk.red('✗')
            : a.status === 'cancelled' ? chalk.dim('⊘')
            : chalk.dim('○');
  const elapsed = a.completedAt && a.startedAt
    ? `${Math.floor((a.completedAt - a.startedAt) / 1000)}s`
    : (a.startedAt ? `${Math.floor((Date.now() - a.startedAt) / 1000)}s` : '');
  const branchLabel = chalk.dim(a.branchName.split('/').slice(-1)[0] ?? a.branchName);
  return `  ${dot} ${a.subtask.title.padEnd(40)} ${branchLabel.padEnd(20)} ${chalk.dim(elapsed)}`;
}

export function registerFleetCommands(program: Command): void {
  const fleet = program.command('fleet')
    .description('Parallel multi-agent work in isolated git worktrees');

  fleet.command('launch <goal...>')
    .description('Decompose a goal into parallel subtasks, spawn agents in worktrees')
    .option('-c, --concurrency <n>', 'Max concurrent agents', '3')
    .option('-n, --max-turns <n>', 'Max turns per agent', '15')
    .option('-m, --model <id>', 'Model for decomposition + agents')
    .option('-v, --verbose', 'Stream per-agent output to stderr')
    .option('--plan-only', 'Decompose but do not spawn agents (dry run)')
    .action(async (goalParts: string[], opts) => {
      const goal = goalParts.join(' ').trim();
      if (!goal) {
        emit({ text: 'Usage: dirgha fleet launch <goal>', exitCode: 1, command: 'fleet launch', timestamp: new Date().toISOString() });
        return;
      }
      const model = opts.model ?? getDefaultModel();

      process.stderr.write(chalk.dim(`[fleet] decomposing goal…\n`));
      const { subtasks } = await decomposeGoal(goal, model);

      process.stderr.write(chalk.bold(`\nGoal: ${goal}\n`));
      process.stderr.write(chalk.dim(`Plan: ${subtasks.length} parallel subtask${subtasks.length > 1 ? 's' : ''}\n\n`));
      for (const s of subtasks) {
        process.stderr.write(`  ${chalk.cyan(s.id)} [${chalk.dim(s.type)}] ${s.title}\n`);
      }
      process.stderr.write('\n');

      if (opts.planOnly) {
        emit({
          data: { subtasks },
          text: `Plan generated (${subtasks.length} subtasks). Use without --plan-only to spawn agents.`,
          exitCode: 0,
          command: 'fleet launch',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const launchOpts: FleetLaunchOptions = {
        concurrency: parseInt(opts.concurrency, 10),
        maxTurns:    parseInt(opts.maxTurns, 10),
        model,
        verbose:     !!opts.verbose,
        onEvent:     (agent) => {
          // Update the shared bus (drives FleetPanel when in TUI)
          const current = fleetEvents.current.map(a => a.id === agent.id ? agent : a);
          if (!current.find(a => a.id === agent.id)) current.push(agent);
          fleetEvents.emitState(current);
          // Pretty stderr progress for headless runs
          if (!opts.verbose && !process.env['DIRGHA_FLEET_AGENT']) {
            process.stderr.write(`\r${renderAgent(agent)}\n`);
          }
        },
      };

      fleetEvents.emitLaunch(goal, []);
      const result = await launchFleet(goal, subtasks, launchOpts);
      fleetEvents.emitDone(result.agents);

      // Summary
      const lines = [
        '',
        chalk.bold(`Fleet done: ${result.successCount}/${result.agents.length} succeeded · ${Math.floor(result.durationMs / 1000)}s`),
        '',
        ...result.agents.map(renderAgent),
        '',
        chalk.dim('Next steps:'),
        chalk.dim(`  dirgha fleet list              — show all worktrees`),
        chalk.dim(`  dirgha fleet merge <agent-id>  — apply an agent's diff back`),
        chalk.dim(`  dirgha fleet cleanup           — remove all fleet worktrees`),
      ];
      emit({
        data: { result },
        text: lines.join('\n'),
        exitCode: result.failCount > 0 && result.successCount === 0 ? 1 : 0,
        command: 'fleet launch',
        timestamp: new Date().toISOString(),
        meta: { durationMs: result.durationMs },
      });
    });

  fleet.command('list')
    .description('List all fleet worktrees attached to this repo')
    .action(async () => {
      const root = getRepoRoot();
      const wts = listWorktrees(root).filter(w => w.branch.startsWith('fleet/'));
      if (wts.length === 0) {
        emit({ text: 'No fleet worktrees found.', exitCode: 0, command: 'fleet list', timestamp: new Date().toISOString() });
        return;
      }
      const lines = [
        chalk.bold(`Fleet worktrees (${wts.length}):`),
        '',
        ...wts.map(w => `  ${chalk.cyan(w.branch.padEnd(50))} ${chalk.dim(w.path)}`),
      ];
      emit({ data: { worktrees: wts }, text: lines.join('\n'), exitCode: 0, command: 'fleet list', timestamp: new Date().toISOString() });
    });

  fleet.command('merge <agentId>')
    .description('Apply an agent\'s diff back to main (3-way, unstaged)')
    .option('--message <msg>', 'Transient commit message')
    .action(async (agentId: string, opts: { message?: string }) => {
      const root = getRepoRoot();
      const wts = listWorktrees(root).filter(w => w.branch.includes(`/${agentId}`));
      if (wts.length === 0) {
        emit({ text: `No fleet worktree found for agent "${agentId}". Try: dirgha fleet list`, exitCode: 1, command: 'fleet merge', timestamp: new Date().toISOString() });
        return;
      }
      const wt = wts[0]!;
      const result = applyBack(wt.path, root, opts.message ?? `fleet: ${agentId}`);

      if (!result.success) {
        emit({
          data: { result }, text: `✗ Apply-back failed: ${result.error}\n${result.conflicts.length ? `Conflicts: ${result.conflicts.join(', ')}` : ''}`,
          exitCode: 1, command: 'fleet merge', timestamp: new Date().toISOString(),
          suggestions: ['Resolve conflicts manually, then run `git add`/`git commit`'],
        });
        return;
      }
      emit({
        data: { result },
        text: `✓ Applied ${result.appliedFiles.length} file change${result.appliedFiles.length === 1 ? '' : 's'} from ${chalk.cyan(agentId)} — review with \`git diff\``,
        exitCode: 0, command: 'fleet merge', timestamp: new Date().toISOString(),
      });
    });

  fleet.command('triple <goal...>')
    .description('TripleShot: 3 parallel variants (conservative/balanced/bold) + judge picks winner')
    .option('-m, --model <id>', 'Model for agents + judge')
    .option('-n, --max-turns <n>', 'Max turns per agent', '15')
    .option('--auto-merge', 'Auto-apply the winner to main as unstaged')
    .action(async (goalParts: string[], opts) => {
      const goal = goalParts.join(' ').trim();
      if (!goal) {
        emit({ text: 'Usage: dirgha fleet triple <goal>', exitCode: 1, command: 'fleet triple', timestamp: new Date().toISOString() });
        return;
      }
      const model = opts.model ?? getDefaultModel();
      fleetEvents.emitLaunch(`[TripleShot] ${goal}`, []);
      const { winner, reason, agents } = await tripleShot(goal, {
        model,
        maxTurns: parseInt(opts.maxTurns, 10),
        concurrency: 3,
        autoMerge: !!opts.autoMerge,
        onEvent: (agent) => {
          const current = fleetEvents.current.map(a => a.id === agent.id ? agent : a);
          if (!current.find(a => a.id === agent.id)) current.push(agent);
          fleetEvents.emitState(current);
        },
      });
      fleetEvents.emitDone(agents);
      const lines = [
        '',
        chalk.bold(`TripleShot complete`),
        `Winner: ${chalk.green(winner || '(none)')}`,
        `Reason: ${chalk.dim(reason)}`,
        '',
        ...agents.map(renderAgent),
      ];
      emit({
        data: { winner, reason, agents },
        text: lines.join('\n'),
        exitCode: winner ? 0 : 1,
        command: 'fleet triple',
        timestamp: new Date().toISOString(),
      });
    });

  fleet.command('cleanup')
    .description('Remove all fleet worktrees and their branches')
    .option('-f, --force', 'Force removal even with uncommitted changes')
    .action(async (opts: { force?: boolean }) => {
      const root = getRepoRoot();
      const wts = listWorktrees(root).filter(w => w.branch.startsWith('fleet/'));
      if (wts.length === 0) {
        emit({ text: 'No fleet worktrees to clean up.', exitCode: 0, command: 'fleet cleanup', timestamp: new Date().toISOString() });
        return;
      }
      let removed = 0;
      for (const w of wts) {
        try {
          destroyWorktree(w.path, root, !!opts.force);
          removed++;
        } catch { /* skip */ }
      }
      emit({
        data: { removed, total: wts.length },
        text: `Removed ${removed}/${wts.length} fleet worktrees.`,
        exitCode: 0, command: 'fleet cleanup', timestamp: new Date().toISOString(),
      });
    });
}
