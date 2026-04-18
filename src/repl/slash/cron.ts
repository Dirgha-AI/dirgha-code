/**
 * repl/slash/cron.ts — Cron job management commands
 */
import chalk from 'chalk';
import { getTheme } from '../themes.js';
import type { SlashCommand, ReplContext } from './types.js';

export const cronCommands: SlashCommand[] = [
  {
    name: 'cron',
    description: 'Manage scheduled jobs: list · add <name> <schedule> <command> · remove <id> · run <id>',
    args: '[list|add|remove|run] [...]',
    category: 'dev',
    handler: async (args, ctx) => {
      const { initCronTable, addJob, removeJob, listJobs, getJob } = await import('../../cron/store.js');
      const { runJobNow } = await import('../../cron/runner.js');
      initCronTable();
      const t = getTheme();
      const parts = args.trim().split(/\s+/);
      const sub = (parts[0] ?? 'list').toLowerCase();

      if (sub === 'list' || !args.trim()) {
        const jobs = listJobs();
        if (!jobs.length) return chalk.dim('No cron jobs. Use: /cron add <name> <schedule> <command>');
        let out = `\n  ${t.header('Scheduled Jobs')}\n\n`;
        for (const j of jobs) {
          const status = j.enabled ? t.success('on') : t.dim('off');
          const last = j.last_run ? j.last_run.slice(0, 16) : 'never';
          out += `  ${t.primary(j.id.padEnd(10))} ${chalk.white(j.name.padEnd(18))} ${t.dim(j.schedule.padEnd(12))} next: ${t.dim(j.next_run.slice(0, 16))}  last: ${t.dim(last)}  [${status}]\n`;
          out += `    ${chalk.dim(j.command)}\n`;
        }
        return out;
      }

      if (sub === 'add') {
        const rest = args.trim().slice(4).trim();
        const nameMatch = rest.match(/^(\S+)\s+/);
        if (!nameMatch) return chalk.red('Usage: /cron add <name> <schedule> <command>');
        const name = nameMatch[1]!;
        const afterName = rest.slice(nameMatch[0].length);
        let schedule: string;
        let command: string;
        const quoted = afterName.match(/^"([^"]+)"\s+(.*)/s);
        if (quoted) {
          schedule = quoted[1]!;
          command = quoted[2]!.trim();
        } else {
          const sp = afterName.indexOf(' ');
          if (sp === -1) return chalk.red('Usage: /cron add <name> <schedule> <command>');
          schedule = afterName.slice(0, sp);
          command = afterName.slice(sp + 1).trim();
        }
        if (!command) return chalk.red('Usage: /cron add <name> <schedule> <command>');
        const id = addJob(name, schedule, command);
        return chalk.green(`Job added: ${id} (${name}) — schedule: ${schedule}`);
      }

      if (sub === 'remove') {
        const id = parts[1];
        if (!id) return chalk.red('Usage: /cron remove <id>');
        const ok = removeJob(id);
        return ok ? chalk.green(`Removed job: ${id}`) : chalk.red(`Job not found: ${id}`);
      }

      if (sub === 'run') {
        const id = parts[1];
        if (!id) return chalk.red('Usage: /cron run <id>');
        const job = getJob(id);
        if (!job) return chalk.red(`Job not found: ${id}`);
        const model = ctx.model ?? 'auto';
        const result = await runJobNow(id, model);
        if (!result.ran) return chalk.red('Failed to run job.');
        const preview = (result.output ?? '').slice(0, 200);
        return chalk.green(`Ran "${result.jobName}":\n`) + chalk.dim(preview);
      }

      return chalk.red(`Unknown cron sub-command: ${sub}. Use: list / add / remove / run`);
    },
  },
];
