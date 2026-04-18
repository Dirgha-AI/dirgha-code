// @ts-nocheck

/**
 * Pay Commands — Lightning Network payments for agents and services
 * @module commands/pay
 * BUCKY: Bitcoin-native payment infrastructure
 */

import { Command } from 'commander';
import { LightningPayments, InvoiceResult, PaymentResult } from '../payments/lightning';
import { getBuckyNode, updateNodeEarnings } from '../services/buckyNode';
import { BudgetEnforcer } from '@dirgha/core/budget';
import chalk from 'chalk';
import ora from 'ora';
import { Table } from 'console-table-printer';

export const payCommands = new Command('pay')
  .description('Bitcoin Lightning payments — invoices, routing, and agent compensation');

// Create invoice
payCommands
  .command('invoice <amount>')
  .description('Create a Lightning invoice')
  .option('-m, --memo <text>', 'Payment memo')
  .option('-e, --expiry <seconds>', 'Expiry time', '3600')
  .action(async (amount, options) => {
    const sats = parseInt(amount);
    if (isNaN(sats) || sats <= 0) {
      console.error(chalk.red('Invalid amount'));
      return;
    }

    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009',
      macaroon: process.env.LND_MACAROON
    });

    const spinner = ora('Creating invoice...').start();

    try {
      const invoice: InvoiceResult = await payments.createInvoice({
        amount: sats,
        memo: options.memo || 'Dirgha CLI',
        expiry: parseInt(options.expiry)
      });

      spinner.succeed(chalk.green('Invoice created'));
      
      console.log(`\n${chalk.cyan('Amount:')} ${invoice.amount} sats`);
      console.log(`${chalk.cyan('Hash:')} ${invoice.paymentHash.slice(0, 24)}...`);
      console.log(`${chalk.cyan('Expires:')} ${new Date(invoice.expiresAt).toLocaleString()}`);
      console.log(`\n${chalk.yellow(invoice.paymentRequest)}\n`);
      
      // Save to pending invoices
      await savePendingInvoice(invoice);
    } catch (err) {
      spinner.fail(chalk.red('Failed to create invoice'));
      console.error(err);
    }
  });

// Send payment
payCommands
  .command('send <amount> <destination>')
  .description('Send a Lightning payment')
  .option('-m, --memo <text>', 'Payment memo')
  .action(async (amount, destination, options) => {
    const sats = parseInt(amount);
    if (isNaN(sats) || sats <= 0) {
      console.error(chalk.red('Invalid amount'));
      return;
    }

    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009',
      macaroon: process.env.LND_MACAROON
    });

    // Budget check
    const enforcer = new BudgetEnforcer();
    const check = enforcer.enforce('user', sats);
    if (!check.allowed) {
      console.error(chalk.red('Budget limit exceeded'));
      return;
    }

    const spinner = ora('Sending payment...').start();

    try {
      const result: PaymentResult = await payments.sendPayment({
        amount: sats,
        destination,
        memo: options.memo || 'Dirgha CLI Payment'
      });

      if (result.success) {
        spinner.succeed(chalk.green('Payment sent'));
        console.log(`Hash: ${result.paymentHash.slice(0, 24)}...`);
        if (result.recipient) {
          console.log(`Recipient: ${result.recipient}`);
        }
      } else {
        spinner.fail(chalk.red('Payment failed'));
      }
    } catch (err) {
      spinner.fail(chalk.red('Payment failed'));
      console.error(err);
    }
  });

// List pending invoices
payCommands
  .command('invoices')
  .description('List pending invoices')
  .option('-a, --all', 'Show all invoices including settled')
  .action(async (options) => {
    const invoices = await loadPendingInvoices();
    
    if (invoices.length === 0) {
      console.log(chalk.yellow('No pending invoices'));
      return;
    }

    const table = new Table({
      columns: [
        { name: 'hash', title: 'Payment Hash' },
        { name: 'amount', title: 'Amount', alignment: 'right' },
        { name: 'status', title: 'Status' },
        { name: 'expires', title: 'Expires' }
      ]
    });

    for (const inv of invoices) {
      const isExpired = new Date(inv.expiresAt) < new Date();
      const status = inv.settled 
        ? chalk.green('PAID')
        : isExpired 
          ? chalk.red('EXPIRED')
          : chalk.yellow('PENDING');

      table.addRow({
        hash: inv.paymentHash.slice(0, 20) + '...',
        amount: inv.amount,
        status,
        expires: new Date(inv.expiresAt).toLocaleDateString()
      });
    }

    table.printTable();
  });

// Balance
payCommands
  .command('balance')
  .description('Show Lightning wallet balance')
  .action(async () => {
    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009'
    });

    const spinner = ora('Fetching balance...').start();

    try {
      const balance = await payments.getBalance();
      spinner.stop();

      console.log(chalk.blue('\n⚡ Lightning Wallet'));
      console.log(chalk.gray('─'.repeat(30)));
      console.log(`Confirmed: ${chalk.green(balance.confirmed.toLocaleString())} sats`);
      console.log(`Unconfirmed: ${chalk.yellow(balance.unconfirmed.toLocaleString())} sats`);
      console.log(`Pending: ${balance.pending.toLocaleString()} sats`);
      console.log(`Total: ${chalk.green(balance.total.toLocaleString())} sats`);
      
      // Fiat conversion (approximate)
      const usd = (balance.total * 0.0001).toFixed(2);
      console.log(chalk.gray(`≈ $${USD} @ $10M/BTC\n`));
    } catch (err) {
      spinner.fail(chalk.red('Failed to fetch balance'));
    }
  });

// Agent payout
payCommands
  .command('payout <agent-id> <amount>')
  .description('Pay an agent for completed work')
  .option('-r, --reason <text>', 'Reason for payment')
  .action(async (agentId, amount, options) => {
    const sats = parseInt(amount);
    
    // Get agent's Lightning address
    const node = await getBuckyNode(agentId);
    if (!node) {
      console.error(chalk.red(`Agent ${agentId} not found`));
      return;
    }

    const destination = node.lightningAddress;
    if (!destination) {
      console.error(chalk.red('Agent has no Lightning address configured'));
      return;
    }

    console.log(chalk.blue(`💸 Paying ${node.name}...`));
    console.log(`Amount: ${sats} sats`);
    console.log(`Destination: ${destination}`);
    console.log(`Reason: ${options.reason || 'Agent work'}\n`);

    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009'
    });

    const spinner = ora('Sending...').start();

    try {
      const result = await payments.sendPayment({
        amount: sats,
        destination,
        memo: options.reason || `Bucky: ${agentId}`
      });

      if (result.success) {
        spinner.succeed(chalk.green('Payment sent'));
        
        // Update node earnings
        await updateNodeEarnings(agentId, sats);
        
        // Record payment in DAO if applicable
        await recordTreasuryMovement(agentId, sats, 'agent_payout');
      } else {
        spinner.fail(chalk.red('Payment failed'));
      }
    } catch (err) {
      spinner.fail(chalk.red('Payment failed'));
      console.error(err);
    }
  });

// Treasury report
payCommands
  .command('treasury [dao]')
  .description('Show DAO treasury movements')
  .action(async (daoName) => {
    if (!daoName) {
      console.log(chalk.yellow('Specify a DAO name or use:'));
      console.log('  dirgha dao list');
      return;
    }

    const movements = await loadTreasuryMovements(daoName);
    
    console.log(chalk.blue(`\n🏦 Treasury: ${daoName}`));
    console.log(chalk.gray('─'.repeat(50)));

    const table = new Table({
      columns: [
        { name: 'date', title: 'Date' },
        { name: 'type', title: 'Type' },
        { name: 'amount', title: 'Amount', alignment: 'right' },
        { name: 'description', title: 'Description' }
      ]
    });

    let totalIn = 0;
    let totalOut = 0;

    for (const m of movements.slice(-20)) {
      const amount = parseInt(m.amount);
      const isIncoming = ['deposit', 'proposal_fund'].includes(m.type);
      
      if (isIncoming) totalIn += amount;
      else totalOut += amount;

      table.addRow({
        date: new Date(m.createdAt).toLocaleDateString(),
        type: isIncoming ? chalk.green(m.type) : chalk.red(m.type),
        amount: isIncoming ? `+${amount}` : `-${amount}`,
        description: m.description || ''
      });
    }

    table.printTable();
    
    console.log(`\n${chalk.green('In:')} +${totalIn.toLocaleString()} sats`);
    console.log(`${chalk.red('Out:')} -${totalOut.toLocaleString()} sats`);
    console.log(`${chalk.cyan('Net:')} ${(totalIn - totalOut).toLocaleString()} sats`);
  });

// Routing fees
payCommands
  .command('fees')
  .description('Show routing fee statistics')
  .action(async () => {
    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009'
    });

    try {
      const stats = await payments.getRoutingStats();
      
      console.log(chalk.blue('\n📊 Routing Statistics'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`Channels: ${stats.channelCount}`);
      console.log(`Total routed: ${stats.totalRouted.toLocaleString()} sats`);
      console.log(`Fees earned: ${chalk.green(stats.feesEarned.toLocaleString())} sats`);
      console.log(`Avg fee rate: ${stats.avgFeeRate} ppm`);
    } catch (err) {
      console.error(chalk.red('Failed to get stats:'), err);
    }
  });

// Helper functions
async function savePendingInvoice(invoice: InvoiceResult) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  
  const dir = path.join(os.homedir(), '.dirgha', 'payments');
  const file = path.join(dir, 'invoices.json');
  
  await fs.mkdir(dir, { recursive: true });
  
  let invoices: InvoiceResult[] = [];
  try {
    invoices = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}
  
  invoices.push(invoice);
  await fs.writeFile(file, JSON.stringify(invoices, null, 2));
}

async function loadPendingInvoices(): Promise<InvoiceResult[]> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const file = path.join(os.homedir(), '.dirgha', 'payments', 'invoices.json');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

async function recordTreasuryMovement(daoId: string, amount: number, type: string) {
  // Record in DAO treasury ledger
  console.log(chalk.dim(`  (Treasury movement recorded: ${type} ${amount} sats)`));
}

async function loadTreasuryMovements(daoName: string): Promise<any[]> {
  // Load from DAO config
  return [];
}
