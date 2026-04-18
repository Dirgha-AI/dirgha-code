/**
 * repl/slash/orchestration.ts — Orchestration slash commands.
 *
 *   /orchestrate <task>    — 3-phase Plan→Code→Verify pipeline via orchestrateTask()
 *   /agents status         — Show active sub-agents (from pool)
 */
import chalk from 'chalk';
import type { SlashCommand } from './types.js';

export const orchestrationCommands: SlashCommand[] = [
  {
    name: 'orchestrate',
    aliases: ['orch'],
    description: 'Run 3-phase Plan→Code→Verify pipeline on a task',
    args: '<task>',
    category: 'agent',
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) return '  Usage: /orchestrate <task description>';

      process.stdout.write('\n  ◆ Orchestrating: ' + task + '\n\n');

      const onProgress = (phase: string, msg: string) => {
        process.stdout.write(chalk.dim(`  [${phase}] ${msg}\n`));
      };

      try {
        const { orchestrateTask } = await import('../../agent/spawn-agent.js');
        const result = await orchestrateTask(task, ctx.model ?? 'auto', onProgress);

        const lines: string[] = [''];
        lines.push(chalk.bold('  Plan'));
        lines.push(chalk.dim('  ' + '─'.repeat(60)));
        lines.push(result.plan ? result.plan : chalk.dim('  (empty)'));
        lines.push('');
        lines.push(chalk.bold('  Implementation'));
        lines.push(chalk.dim('  ' + '─'.repeat(60)));
        lines.push(result.implementation ? result.implementation : chalk.dim('  (empty)'));
        lines.push('');
        lines.push(chalk.bold('  Verification'));
        lines.push(chalk.dim('  ' + '─'.repeat(60)));
        lines.push(result.verification ? result.verification : chalk.dim('  (empty)'));
        lines.push('');
        return lines.join('\n');
      } catch (e: any) {
        return '  ✗ Orchestration failed: ' + e.message;
      }
    },
  },
  {
    name: 'agents',
    description: 'Show agent orchestration status',
    args: '[status|kill <n>]',
    category: 'orchestration',
    handler: async (args, _ctx) => {
      const sub = args.trim().split(/\s+/)[0] ?? 'status';
      if (sub === 'status') {
        // AgentPool isn't globally observable yet — show placeholder
        return chalk.dim('  No active orchestrations. Use /orchestrate <goal> to start one.');
      }
      return chalk.dim(`  Unknown sub-command: agents ${sub}`);
    },
  },
];
