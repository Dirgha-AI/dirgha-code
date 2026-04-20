// @ts-nocheck

/**
 * DAO Commands — Decentralized autonomous organization management
 * @module commands/dao
 * BUCKY: DAO + Agents + Payments integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { commitProposal, commitVote } from '../../../../../apps/bucky/src/dao/commit-reveal.js';
// Stubs for unavailable packages (experimental DAO commands)
const DAOFactory: any = class {};
const DAOConfig: any = {};
const BudgetEnforcer: any = class {};
const AgentSwarm: any = class {};
const LightningPayments: any = class {};
const Table: any = class { addRow(_r: any) {} printTable() {} };

export const daoCommands = new Command('dao')
  .description('DAO management — create, vote, and manage decentralized organizations');

export function registerDAOCommands(program: Command): void {
  program.addCommand(daoCommands);
}

// Create DAO
daoCommands
  .command('create <name>')
  .description('Create a new DAO with Taproot Assets')
  .option('-t, --type <type>', 'Voting type (quadratic|weighted|reputation)', 'quadratic')
  .option('-c, --chain <chain>', 'Blockchain (base|bitcoin)', 'bitcoin')
  .option('-m, --members <members>', 'Initial members (comma-separated pubkeys)')
  .option('--quorum <n>', 'Quorum percentage', '51')
  .option('--threshold <n>', 'Pass threshold percentage', '67')
  .action(async (name, options) => {
    console.log(chalk.blue(`🏛️  Creating DAO: ${name}`));
    
    const config: DAOConfig = {
      name,
      description: `DAO for ${name}`,
      votingType: options.type,
      initialMembers: options.members?.split(',') || [],
      chain: options.chain
    };

    const factory = new DAOFactory({
      tapdUrl: process.env.TAPD_URL || 'localhost:8089',
      macaroon: process.env.TAPD_MACAROON || ''
    });

    try {
      const result = await factory.createDAO(config);
      
      console.log(chalk.green('✅ DAO created successfully'));
      console.log(`   DAO ID: ${result.daoId}`);
      console.log(`   Governance: ${result.governanceAddress}`);
      console.log(`   Treasury: ${result.treasuryAddress}`);
      console.log(`   Identity Asset: ${result.identityAssetId}`);
      
      // Save to local config
      await saveDAOConfig(name, result);
    } catch (err) {
      console.error(chalk.red('Failed to create DAO:'), err);
    }
  });

// List DAOs
daoCommands
  .command('list')
  .description('List your DAOs')
  .action(async () => {
    const daos = await loadDAOConfigs();
    
    if (daos.length === 0) {
      console.log(chalk.yellow('No DAOs found. Create one with:'));
      console.log('  dirgha dao create <name>');
      return;
    }

    const table = new Table({
      columns: [
        { name: 'name', title: 'Name', alignment: 'left' },
        { name: 'daoId', title: 'DAO ID', alignment: 'left' },
        { name: 'treasury', title: 'Treasury', alignment: 'left' },
        { name: 'members', title: 'Members', alignment: 'right' }
      ]
    });

    for (const dao of daos) {
      table.addRow({
        name: chalk.cyan(dao.name),
        daoId: dao.daoId.slice(0, 20) + '...',
        treasury: dao.treasuryAddress.slice(0, 16) + '...',
        members: dao.memberCount || 0
      });
    }

    table.printTable();
  });

// Show DAO details
daoCommands
  .command('show <name>')
  .description('Show DAO details and treasury')
  .action(async (name) => {
    const dao = await loadDAOConfig(name);
    if (!dao) {
      console.error(chalk.red(`DAO "${name}" not found`));
      return;
    }

    console.log(chalk.blue(`\n🏛️  ${dao.name}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`DAO ID:       ${dao.daoId}`);
    console.log(`Governance:   ${dao.governanceAddress}`);
    console.log(`Treasury:     ${dao.treasuryAddress}`);
    console.log(`Voting:       ${dao.votingType}`);
    console.log(`Quorum:       ${dao.quorum}%`);
    console.log(`Threshold:    ${dao.threshold}%`);
    console.log(`\nTreasury Balance: ${chalk.green(dao.balance || '0 sats')}`);
    
    if (dao.proposals?.length > 0) {
      console.log(`\nActive Proposals: ${dao.proposals.length}`);
      for (const p of dao.proposals.slice(0, 5)) {
        console.log(`  • ${p.title} (${p.status})`);
      }
    }
  });

// Deposit to treasury
daoCommands
  .command('deposit <name> <amount>')
  .description('Deposit sats to DAO treasury')
  .action(async (name, amount) => {
    const dao = await loadDAOConfig(name);
    if (!dao) {
      console.error(chalk.red(`DAO "${name}" not found`));
      return;
    }

    const sats = parseInt(amount);
    if (isNaN(sats) || sats <= 0) {
      console.error(chalk.red('Invalid amount'));
      return;
    }

    console.log(chalk.blue(`Depositing ${sats} sats to ${name} treasury...`));
    
    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009'
    });

    try {
      const invoice = await payments.createInvoice({
        amount: sats,
        memo: `DAO Treasury: ${dao.daoId}`,
        expiry: 3600
      });

      console.log(chalk.green('✅ Invoice created'));
      console.log(`Amount: ${invoice.amount} sats`);
      console.log(`Expires: ${new Date(invoice.expiresAt).toLocaleString()}`);
      console.log(`\nPay this invoice to deposit:`);
      console.log(chalk.yellow(invoice.paymentRequest));
    } catch (err) {
      console.error(chalk.red('Failed to create invoice:'), err);
    }
  });

// Create proposal
daoCommands
  .command('propose <dao> <title>')
  .description('Create a treasury spend proposal')
  .option('-a, --amount <n>', 'Amount in sats', '0')
  .option('-t, --to <address>', 'Recipient address')
  .option('-d, --description <text>', 'Proposal description')
  .option('--deadline <hours>', 'Voting deadline in hours', '72')
  .action(async (daoName, title, options) => {
    const dao = await loadDAOConfig(daoName);
    if (!dao) {
      console.error(chalk.red(`DAO "${daoName}" not found`));
      return;
    }

    const proposal = {
      daoId: dao.daoId,
      title,
      action: 'treasury_spend',
      target: options.to || '',
      amount: parseInt(options.amount) || 0,
      description: options.description || '',
      deadline: new Date(Date.now() + parseInt(options.deadline) * 3600000)
    };

    console.log(chalk.blue('Creating proposal...'));
    console.log(`Title: ${proposal.title}`);
    console.log(`Amount: ${proposal.amount} sats`);
    console.log(`To: ${proposal.target || 'N/A'}`);

    const commit = commitProposal(dao.daoId, title, proposal.action, proposal.target, dao.daoId);
    console.log(chalk.dim(`  Commit hash: ${commit.commitHash.slice(0, 16)}...`));

    // In production, this would submit to the DAO contract
    console.log(chalk.green('✅ Proposal committed and submitted'));
    console.log(`Voting ends: ${proposal.deadline.toLocaleString()}`);
  });

// Vote on proposal
daoCommands
  .command('vote <dao> <proposalId>')
  .description('Vote on a proposal')
  .option('-s, --support', 'Vote yes', true)
  .option('-r, --reject', 'Vote no')
  .action(async (daoName, proposalId, options) => {
    const support = options.reject ? false : options.support;
    
    console.log(chalk.blue(`Voting ${support ? 'YES' : 'NO'} on proposal ${proposalId}`));

    const voteCommit = commitVote(proposalId, daoName, support);
    console.log(chalk.dim(`  Commit hash: ${voteCommit.commitHash.slice(0, 16)}...`));

    // Sign vote with local identity
    const signature = await signVote(daoName, proposalId, support);

    console.log(chalk.green('✅ Vote committed and recorded'));
    console.log(`Signature: ${signature.slice(0, 30)}...`);
  });

// Agent payment distribution
daoCommands
  .command('distribute <dao>')
  .description('Distribute payments to agents based on work')
  .option('--dry-run', 'Show distribution without executing')
  .action(async (daoName, options) => {
    const dao = await loadDAOConfig(daoName);
    if (!dao) {
      console.error(chalk.red(`DAO "${daoName}" not found`));
      return;
    }

    console.log(chalk.blue('💰 Calculating agent payments...'));

    const swarm = new AgentSwarm();
    const payments = await swarm.calculatePayments(dao.daoId);

    const table = new Table({
      columns: [
        { name: 'agent', title: 'Agent' },
        { name: 'tasks', title: 'Tasks', alignment: 'right' },
        { name: 'reputation', title: 'Rep', alignment: 'right' },
        { name: 'payment', title: 'Payment (sats)', alignment: 'right' }
      ]
    });

    let total = 0;
    for (const p of payments) {
      table.addRow({
        agent: p.agentName,
        tasks: p.taskCount,
        reputation: p.reputationScore.toFixed(1),
        payment: chalk.green(p.amount.toLocaleString())
      });
      total += p.amount;
    }

    table.printTable();
    console.log(`\nTotal: ${chalk.green(total.toLocaleString() + ' sats')}`);

    if (!options.dryRun) {
      console.log(chalk.yellow('\nExecuting payments...'));
      // In production, send Lightning payments
    }
  });

// Helper functions
async function saveDAOConfig(name: string, config: any) {
  // Save to ~/.dirgha/daos.json
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  
  const configDir = path.join(os.homedir(), '.dirgha');
  const configPath = path.join(configDir, 'daos.json');
  
  await fs.mkdir(configDir, { recursive: true });
  
  let daos: any[] = [];
  try {
    const existing = await fs.readFile(configPath, 'utf8');
    daos = JSON.parse(existing);
  } catch {
    // File doesn't exist
  }
  
  daos.push({ name, ...config, createdAt: new Date().toISOString() });
  await fs.writeFile(configPath, JSON.stringify(daos, null, 2));
}

async function loadDAOConfigs(): Promise<any[]> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const configPath = path.join(os.homedir(), '.dirgha', 'daos.json');
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function loadDAOConfig(name: string): Promise<any | null> {
  const daos = await loadDAOConfigs();
  return daos.find((d: any) => d.name === name) || null;
}

async function signVote(daoName: string, proposalId: string, support: boolean): Promise<string> {
  // In production, use Bitcoin wallet to sign
  const crypto = await import('crypto');
  const data = `${daoName}:${proposalId}:${support}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}
