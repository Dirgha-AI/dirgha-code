import chalk from 'chalk';
import { getContext } from './context.js';

export function handleBilling(): void {
  const ctx = getContext();
  
  if (!ctx.billing) {
    console.log(chalk.yellow('⚠️  Not connected to mesh'));
    return;
  }

  const summary = ctx.billing.getTeamSummary();

  console.log(chalk.bold.blue('\n💰 Team Billing Summary\n'));
  console.log(`  Total Revenue: ${chalk.green(summary.totalRevenueSats.toLocaleString())} sats (${chalk.green('$' + summary.totalRevenueUsd.toFixed(2))})`);
  console.log(`  Invoices: ${chalk.yellow(summary.paidInvoices)}/${summary.totalInvoices} paid`);
  console.log(`  Pending: ${chalk.gray(summary.pendingInvoices)}`);
  console.log(`  Active Members: ${chalk.cyan(summary.memberCount)}`);
}
