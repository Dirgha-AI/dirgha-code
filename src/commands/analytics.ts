/**
 * commands/analytics.ts — Analytics CLI commands
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { getTopTools, getAverageSessionDuration, getDailyCost } from '../analytics/insights.js';

export function registerAnalyticsCommands(program: Command): void {
  program
    .command('insights')
    .description('Show usage insights')
    .action(() => {
      console.log(chalk.bold('Insights:'));
      console.log(chalk.dim(`  Avg session: ${(getAverageSessionDuration() / 1000).toFixed(1)}s`));
      console.log(chalk.dim(`  Daily cost: $${getDailyCost().toFixed(2)}`));
      
      const tools = getTopTools();
      if (tools.length > 0) {
        console.log(chalk.dim('\n  Top tools:'));
        for (const t of tools.slice(0, 5)) {
          console.log(chalk.dim(`    ${t.tool}: ${t.count} uses`));
        }
      }
    });
}
