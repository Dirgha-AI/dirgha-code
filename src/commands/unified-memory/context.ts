// @ts-nocheck

/**
 * context command - Show current context window for LLM
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getMemory } from '../../utils/unified-memory.js';

export function registerContextCommand(program: Command): void {
  program
    .command('ctx [query]')
    .description('Show context window (top memories for LLM)')
    .option('-n, --limit <n>', 'Number of memories', '50')
    .option('--min-truth <n>', 'Minimum truth score', '0.8')
    .action(async (query: string | undefined, opts) => {
      const mem = getMemory();
      const n = parseInt(opts.limit, 10);
      const minTruth = parseFloat(opts.minTruth);

      try {
        const memories = query
          ? mem.search(query, { limit: n })
          : mem.getContextWindow({ n, minTruth });

        if (memories.length === 0) {
          console.log(chalk.yellow('No context available'));
          return;
        }

        console.log(chalk.blue(`\nContext Window (${memories.length} memories):\n`));
        memories.forEach((m, i) => {
          const c = m.tier === 'hot' ? chalk.red : m.tier === 'warm' ? chalk.yellow : chalk.gray;
          console.log(`${chalk.dim(`${i + 1}.`)} ${c(`[${m.truthScore.toFixed(2)}]`)} ${m.content.slice(0, 60)}...`);
        });
      } catch (e) {
        console.error(chalk.red('Failed:'), e);
      }
    });
}
