// @ts-nocheck

/**
 * memory-stats command - Show unified memory statistics
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getMemory } from '../../utils/unified-memory.js';

export function registerMemoryStatsCommand(program: Command): void {
  program
    .command('memory-stats')
    .description('Show unified memory statistics')
    .action(async () => {
      const mem = getMemory();
      try {
        const s = mem.getStats();
        console.log(chalk.blue('\nMemory Statistics\n'));
        console.log(`Total: ${chalk.white(s.totalEntries.toString())} | Sessions: ${chalk.white(s.activeSessions.toString())}`);
        console.log(chalk.blue('\nBy Layer:'));
        Object.entries(s.byLayer).forEach(([k, v]) => console.log(`  ${k}: ${chalk.white(v.toString())}`));
        console.log(chalk.blue('\nBy Tier:'));
        Object.entries(s.byTier).forEach(([k, v]) => {
          const c = k === 'hot' ? chalk.red : k === 'warm' ? chalk.yellow : chalk.gray;
          console.log(`  ${c(k)}: ${chalk.white(v.toString())}`);
        });
        console.log(chalk.blue('\nQuality:'));
        console.log(`  Hot: ${chalk.red(s.hotFacts.toString())} | Stale: ${chalk.yellow(s.staleFacts.toString())} | Avg Truth: ${(s.avgTruthScore * 100).toFixed(1)}%`);
      } catch (e) {
        console.error(chalk.red('Failed:'), e);
      }
    });
}
