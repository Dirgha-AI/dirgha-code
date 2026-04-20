import chalk from 'chalk';
import { getContext } from './context.js';

export function handleConsensus(): void {
  const ctx = getContext();
  
  if (!ctx.consensus) {
    console.log(chalk.yellow('⚠️  Not connected to mesh'));
    return;
  }

  const stats = ctx.consensus.getStats();

  console.log(chalk.bold.blue('\n🛡️  Consensus Engine Stats\n'));
  console.log(`  Active Verifications: ${chalk.yellow(stats.activeRounds)}`);
  console.log(`  Completed: ${chalk.green(stats.completedRounds)}`);
  console.log(`  Verified: ${chalk.green(stats.verifiedCount)}`);
  console.log(`  Failed: ${chalk.red(stats.failedCount)}`);
  console.log(`  Avg Verifications/Result: ${chalk.cyan(stats.averageVerifications.toFixed(1))}`);
}
