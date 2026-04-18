// @ts-nocheck

/**
 * recall command - Retrieve memories from unified graph
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getMemory } from '../../utils/unified-memory.js';

export function registerRecallCommand(program: Command): void {
  program
    .command('recall [query]')
    .description('Search memories (replaces query)')
    .option('-t, --type <type>', 'Filter by type')
    .option('-l, --layer <layer>', 'Filter by layer')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--topic <topic>', 'Filter by topic')
    .option('--min-truth <n>', 'Minimum truth score', '0.5')
    .option('-n, --limit <n>', 'Max results', '20')
    .option('--hot-only', 'Only hot-tier memories')
    .action(async (query: string | undefined, opts) => {
      const mem = getMemory();
      const tags = opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined;
      const minTruth = parseFloat(opts.minTruth);
      const limit = parseInt(opts.limit, 10);

      try {
        const results = query
          ? mem.search(query, { tags, limit })
          : mem.recall({
              layer: opts.layer,
              type: opts.type,
              tags,
              topic: opts.topic,
              minTruth,
              limit,
              includeTiers: opts.hotOnly ? ['hot'] : ['hot', 'warm', 'cold'],
            });

        if (results.length === 0) {
          console.log(chalk.yellow('No memories found'));
          return;
        }

        console.log(chalk.blue(`\n${results.length} memories:\n`));
        for (const r of results) {
          const color = r.tier === 'hot' ? chalk.red : r.tier === 'warm' ? chalk.yellow : chalk.gray;
          console.log(`${color(`[${r.tier.toUpperCase()}]`)} ${r.content.slice(0, 70)}...`);
          console.log(chalk.gray(`  ${(r.truthScore * 100).toFixed(0)}% truth | ${r.layer}`));
        }
      } catch (e) {
        console.error(chalk.red('Failed:'), e);
        process.exit(1);
      }
    });
}
