/**
 * commands/sprint.ts — Dirgha Sprint Engine CLI commands
 *
 * Registers: dirgha sprint start|status|pause|resume|skip|log|list|abort|inspect|_daemon
 *            dirgha run <planFile>
 */
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { parseManifest } from '../sprint/manifest.js';
import { SprintJournal } from '../sprint/journal.js';
import { runSprint } from '../sprint/executor.js';
import { startWatchdog, stopWatchdog } from '../sprint/watchdog.js';
import type { SprintManifest } from '../sprint/types.js';

const JOURNALS_DIR = path.join(os.homedir(), '.dirgha', 'journals');

function formatElapsed(startedAt?: string): string {
  if (!startedAt) return '—';
  const ms = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function registerSprintCommand(program: Command): void {
  const sprintCmd = program
    .command('sprint')
    .description('Manage autonomous sprints — structured task execution with verification');

  // --- start ---
  sprintCmd
    .command('start <manifestPath>')
    .description('Start a new sprint from a YAML manifest')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (manifestPath: string, opts: { yes?: boolean }) => {
      try {
        const absolutePath = path.resolve(manifestPath);
        const manifest = await parseManifest(absolutePath);

        console.log(chalk.bold.blue(`\nSprint: ${manifest.id}`));
        console.log(chalk.gray(`Goal: ${manifest.goal}`));
        console.log(chalk.gray(`Model: ${manifest.model}  |  Max parallel: ${manifest.maxParallel}\n`));
        console.log(chalk.bold('Tasks:'));
        manifest.tasks.forEach((task, i) => {
          const deps = task.dependsOn.length ? ` (needs: ${task.dependsOn.join(', ')})` : '';
          console.log(chalk.gray(`  ${i + 1}. [${task.id}] ${task.title} ~${task.estimatedMinutes}m${deps}`));
        });
        console.log();

        const journal = new SprintJournal(manifest.id);
        const yamlStr = fs.readFileSync(absolutePath, 'utf-8');
        journal.initSprint(manifest.id, manifest.goal, yamlStr);

        await startWatchdog(manifest.id, absolutePath);
        console.log(chalk.green(`✓ Sprint ${manifest.id} started`));
        console.log(chalk.gray(`  Monitor: dirgha sprint status ${manifest.id}`));
        console.log(chalk.gray(`  Log:     dirgha sprint log ${manifest.id}`));
      } catch (err) {
        console.error(chalk.red(`Failed to start sprint: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- status ---
  sprintCmd
    .command('status [id]')
    .description('Show sprint progress or list all sprints')
    .action(async (id?: string) => {
      try {
        if (id) {
          const journal = new SprintJournal(id);
          const progress = journal.getProgress();
          console.log(chalk.bold.blue(`\nSprint: ${progress.sprintId}`));
          console.log(chalk.gray(`Goal: ${progress.goal}`));
          console.log(chalk.gray(`Status: ${progress.status}  |  Elapsed: ${formatElapsed(progress.startedAt)}\n`));
          console.log(chalk.bold('Tasks:'));
          for (const task of progress.tasks) {
            const statusColor = task.status === 'completed' ? chalk.green
              : task.status === 'running' ? chalk.yellow
              : task.status === 'failed' ? chalk.red
              : chalk.gray;
            console.log(`  ${statusColor(`[${task.status}]`)} ${task.taskId}: ${chalk.white(task.title)} (attempts: ${task.attempts})`);
          }
        } else {
          if (!fs.existsSync(JOURNALS_DIR)) {
            console.log(chalk.yellow('No sprints found.'));
            return;
          }
          const dbs = fs.readdirSync(JOURNALS_DIR).filter(f => f.endsWith('.db'));
          if (dbs.length === 0) {
            console.log(chalk.yellow('No sprints found.'));
            return;
          }
          console.log(chalk.bold.blue('\nSprints:'));
          for (const db of dbs) {
            const sprintId = db.replace('.db', '');
            try {
              const journal = new SprintJournal(sprintId);
              const progress = journal.getProgress();
              const statusColor = progress.status === 'completed' ? chalk.green
                : progress.status === 'running' ? chalk.yellow
                : progress.status === 'aborted' ? chalk.red
                : chalk.cyan;
              const done = progress.tasks.filter(t => t.status === 'completed').length;
              console.log(`  ${statusColor(progress.status.padEnd(10))} ${sprintId} (${done}/${progress.tasks.length} tasks)`);
            } catch {
              console.log(chalk.gray(`  ${sprintId} (unreadable)`));
            }
          }
        }
      } catch (err) {
        console.error(chalk.red(`Failed to get status: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- pause ---
  sprintCmd
    .command('pause <id>')
    .description('Pause a running sprint after current task completes')
    .action(async (id: string) => {
      try {
        const journal = new SprintJournal(id);
        journal.setSprintStatus(id, 'paused');
        await stopWatchdog(id);
        console.log(chalk.yellow(`Sprint ${id} paused. Resume: dirgha sprint resume ${id} --manifest <path>`));
      } catch (err) {
        console.error(chalk.red(`Failed to pause: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- resume ---
  sprintCmd
    .command('resume <id>')
    .description('Resume a paused sprint')
    .requiredOption('-m, --manifest <path>', 'Path to manifest YAML file')
    .action(async (id: string, opts: { manifest: string }) => {
      try {
        const absolutePath = path.resolve(opts.manifest);
        const journal = new SprintJournal(id);
        journal.setSprintStatus(id, 'running');
        await startWatchdog(id, absolutePath);
        console.log(chalk.green(`Sprint ${id} resumed.`));
      } catch (err) {
        console.error(chalk.red(`Failed to resume: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- skip ---
  sprintCmd
    .command('skip <taskId>')
    .description('Skip a task (unblocks dependents)')
    .requiredOption('-s, --sprint <id>', 'Sprint ID')
    .action(async (taskId: string, opts: { sprint: string }) => {
      try {
        const journal = new SprintJournal(opts.sprint);
        journal.setTaskStatus(taskId, 'skipped');
        console.log(chalk.yellow(`Task ${taskId} skipped in sprint ${opts.sprint}.`));
      } catch (err) {
        console.error(chalk.red(`Failed to skip task: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- log ---
  sprintCmd
    .command('log <id>')
    .description('Show sprint event log')
    .option('-n, --limit <n>', 'Number of events to show', '30')
    .action(async (id: string, opts: { limit: string }) => {
      try {
        const journal = new SprintJournal(id);
        const events = journal.getEvents(parseInt(opts.limit, 10));
        console.log(chalk.bold.blue(`\nEvents for sprint ${id}:\n`));
        for (const ev of events.reverse()) {
          const taskStr = ev.taskId ? chalk.cyan(` [${ev.taskId}]`) : '';
          const payload = ev.payload ? chalk.gray(` ${JSON.stringify(ev.payload).slice(0, 80)}`) : '';
          console.log(`${chalk.gray(ev.ts.slice(11, 19))} ${chalk.yellow(ev.type)}${taskStr}${payload}`);
        }
      } catch (err) {
        console.error(chalk.red(`Failed to get log: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- list ---
  sprintCmd
    .command('list')
    .description('List all sprints')
    .action(async () => {
      try {
        if (!fs.existsSync(JOURNALS_DIR)) { console.log(chalk.yellow('No sprints found.')); return; }
        const dbs = fs.readdirSync(JOURNALS_DIR).filter(f => f.endsWith('.db'));
        if (dbs.length === 0) { console.log(chalk.yellow('No sprints found.')); return; }
        console.log(chalk.bold.blue('\nAll sprints:\n'));
        for (const db of dbs) {
          const sprintId = db.replace('.db', '');
          try {
            const journal = new SprintJournal(sprintId);
            const progress = journal.getProgress();
            const done = progress.tasks.filter(t => t.status === 'completed').length;
            const total = progress.tasks.length;
            console.log(chalk.white(`  ${sprintId}`) + chalk.gray(` — ${progress.status} — ${done}/${total} tasks — ${progress.goal.slice(0, 60)}`));
          } catch {
            console.log(chalk.gray(`  ${sprintId} (error reading)`));
          }
        }
      } catch (err) {
        console.error(chalk.red(`Failed to list: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- abort ---
  sprintCmd
    .command('abort <id>')
    .description('Abort sprint immediately, preserve state')
    .action(async (id: string) => {
      try {
        const journal = new SprintJournal(id);
        journal.setSprintStatus(id, 'aborted');
        await stopWatchdog(id);
        console.log(chalk.red(`Sprint ${id} aborted.`));
      } catch (err) {
        console.error(chalk.red(`Failed to abort: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- inspect ---
  sprintCmd
    .command('inspect <taskId>')
    .description('Full details for a task: prompt, output, verify log, errors')
    .requiredOption('-s, --sprint <id>', 'Sprint ID')
    .action(async (taskId: string, opts: { sprint: string }) => {
      try {
        const journal = new SprintJournal(opts.sprint);
        const state = journal.getTaskState(taskId);
        if (!state) { console.log(chalk.yellow(`Task ${taskId} not found.`)); return; }
        console.log(chalk.bold.blue(`\nTask: ${taskId} in sprint ${opts.sprint}\n`));
        console.log(chalk.gray(`Status:    ${state.status}`));
        console.log(chalk.gray(`Attempts:  ${state.attempts}`));
        console.log(chalk.gray(`Started:   ${state.startedAt ?? '—'}`));
        console.log(chalk.gray(`Completed: ${state.completedAt ?? '—'}`));
        console.log(chalk.gray(`Git SHA:   ${state.gitSha ?? '—'}`));
        if (state.errorLog) console.log(chalk.red(`\nError: ${state.errorLog}`));
        if (state.agentOutput) console.log(chalk.white(`\nAgent output (last 2000 chars):\n${state.agentOutput}`));
        if (state.verifyLog) {
          console.log(chalk.bold('\nVerification:'));
          for (const v of state.verifyLog) {
            const icon = v.passed ? chalk.green('✓') : chalk.red('✗');
            console.log(`  ${icon} ${v.type}: ${v.detail} (${v.durationMs}ms)`);
          }
        }
      } catch (err) {
        console.error(chalk.red(`Failed to inspect: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  // --- _daemon (hidden, used by PM2) ---
  sprintCmd
    .command('_daemon <id> <manifestPath>')
    .description('Internal: PM2 daemon entry point')
    .addHelpText('after', '(Internal command — do not use manually)')
    .action(async (id: string, manifestPath: string) => {
      try {
        const absolutePath = path.resolve(manifestPath);
        const manifest = await parseManifest(absolutePath);
        const journal = new SprintJournal(id);
        journal.setSprintStatus(id, 'running');
        await runSprint(manifest, journal, { verbose: true });
      } catch (err) {
        console.error(chalk.red(`Daemon error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <planFile>')
    .description('Read a markdown plan, generate sprint YAML, and start executing')
    .action(async (planFile: string) => {
      try {
        const absolutePath = path.resolve(planFile);
        if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);
        console.log(chalk.blue(`Reading plan: ${absolutePath}`));
        console.log(chalk.gray('Note: Use a YAML manifest for full sprint control.'));
        console.log(chalk.gray('Parsing plan file as sprint manifest...'));
        const manifest = await parseManifest(absolutePath);
        const journal = new SprintJournal(manifest.id);
        const yamlStr = fs.readFileSync(absolutePath, 'utf-8');
        journal.initSprint(manifest.id, manifest.goal, yamlStr);
        await runSprint(manifest, journal, { verbose: true });
        console.log(chalk.green('Plan execution completed.'));
      } catch (err) {
        console.error(chalk.red(`Failed to run plan: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
