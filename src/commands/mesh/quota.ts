// @ts-nocheck
import chalk from 'chalk';
import { getContext } from './context.js';

export function handleQuota(memberId?: string): void {
  const ctx = getContext();
  
  if (!ctx.pool) {
    console.log(chalk.yellow('⚠️  Not connected to mesh'));
    return;
  }

  const targetId = memberId || 'current-user';
  const quotas = ctx.pool.getQuotaStatus();
  const quota = quotas.find(q => q.memberId === targetId);

  if (!quota) {
    console.log(chalk.yellow(`⚠️  No quota found for ${targetId}`));
    return;
  }

  const member = ctx.pool['members'].get(targetId);
  const percentUsed = (quota.tokensUsed / (quota.tokensUsed + quota.tokensRemaining)) * 100;

  console.log(chalk.bold.blue(`\n📊 Quota for ${member?.name || targetId}\n`));
  console.log(`  Role: ${chalk.cyan(member?.role || 'unknown')}`);
  console.log(`  Daily Limit: ${chalk.green((quota.tokensUsed + quota.tokensRemaining).toLocaleString())} tokens`);
  console.log(`  Used: ${chalk.yellow(quota.tokensUsed.toLocaleString())} (${percentUsed.toFixed(1)}%)`);
  console.log(`  Remaining: ${chalk.green(quota.tokensRemaining.toLocaleString())}`);
  console.log(`  Cost Accrued: $${chalk.cyan(quota.costAccrued.toFixed(4))}`);
  console.log(`  Last Reset: ${quota.lastReset.toLocaleDateString()}`);

  const barWidth = 30;
  const filled = Math.floor((percentUsed / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  console.log(`\n  ${bar}`);
}
