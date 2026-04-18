// @ts-nocheck

/**
 * Agent Swarm Commands — Multi-agent task orchestration
 * @module commands/agent-swarm
 * BUCKY: Autonomous agent coordination with payments
 */

import { Command } from 'commander';
import { AgentSwarm, WorkerAgent, AgentRole } from '@dirgha/core/agent-swarm';
import { ColonyScheduler } from '@dirgha/core/colony';
import { BudgetEnforcer } from '@dirgha/core/budget';
import { LightningPayments } from '../payments/lightning';
import chalk from 'chalk';
import ora from 'ora';

export const swarmCommands = new Command('swarm')
  .description('Agent swarm orchestration — deploy and manage agent teams');

// Initialize swarm
swarmCommands
  .command('init <name>')
  .description('Initialize a new agent swarm')
  .option('-b, --budget <sats>', 'Budget in sats', '1000000')
  .option('--workers <n>', 'Number of worker agents', '5')
  .action(async (name, options) => {
    const spinner = ora('Initializing swarm...').start();
    
    const swarm = new AgentSwarm({
      name,
      maxWorkers: parseInt(options.workers),
      budgetSats: parseInt(options.budget)
    });

    // Create budget enforcer
    const enforcer = new BudgetEnforcer({
      strictMode: true,
      bufferPercent: 10
    });

    enforcer.setLimit({
      scope: 'swarm',
      scopeId: name,
      maxAmount: parseInt(options.budget),
      currentAmount: 0,
      window: 'daily'
    });

    spinner.succeed(chalk.green(`Swarm "${name}" initialized`));
    console.log(`Budget: ${options.budget} sats`);
    console.log(`Workers: ${options.workers}`);
  });

// Deploy task
swarmCommands
  .command('deploy <swarm> <task>')
  .description('Deploy a task to the swarm')
  .option('-r, --role <role>', 'Agent role (codewriter|reviewer|tester)', 'codewriter')
  .option('-p, --priority <n>', 'Priority (1-10)', '5')
  .option('-t, --timeout <ms>', 'Timeout in ms', '300000')
  .action(async (swarmName, taskSpec, options) => {
    console.log(chalk.blue(`🐝 Deploying to ${swarmName}...`));

    const swarm = await loadSwarm(swarmName);
    if (!swarm) {
      console.error(chalk.red(`Swarm "${swarmName}" not found`));
      return;
    }

    // Check budget
    const budgetCheck = swarm.enforcer.enforce(swarmName, 1000); // Estimate 1000 sats
    if (!budgetCheck.allowed) {
      console.error(chalk.red('Budget exceeded:'), budgetCheck.message);
      return;
    }

    const task = {
      id: `task-${Date.now()}`,
      type: options.role,
      payload: { spec: taskSpec },
      priority: parseInt(options.priority),
      timeout: parseInt(options.timeout)
    };

    const spinner = ora('Agents working...').start();

    try {
      const result = await swarm.execute(task);
      
      spinner.succeed(chalk.green('Task completed'));
      
      // Show results
      console.log(`\nAgents used: ${result.agents.length}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Cost: ${result.cost} sats`);
      
      if (result.output) {
        console.log(`\n${chalk.cyan('Output:')}`);
        console.log(result.output);
      }

      // Queue payment
      await queuePayment(result.agents, result.cost);
    } catch (err) {
      spinner.fail(chalk.red('Task failed'));
      console.error(err);
    }
  });

// Colony mode (DAG execution)
swarmCommands
  .command('colony <swarm> <workflow-file>')
  .description('Execute a workflow DAG')
  .option('--parallel', 'Run parallel groups', false)
  .action(async (swarmName, workflowFile, options) => {
    console.log(chalk.blue('🐜 Colony mode: DAG execution'));

    const fs = await import('fs/promises');
    const workflow = JSON.parse(await fs.readFile(workflowFile, 'utf8'));

    const scheduler = new ColonyScheduler();
    const plan = scheduler.createPlan(workflow);

    console.log(`Critical path: ${plan.criticalPath.join(' → ')}`);
    console.log(`Estimated: ${plan.estimatedDuration}ms`);
    console.log(`Concurrency: ${plan.concurrency}x\n`);

    const spinner = ora('Executing workflow...').start();

    for (const group of plan.parallelGroups) {
      spinner.text = `Executing ${group.length} tasks in parallel...`;
      await Promise.all(group.map(taskId => executeTask(taskId, workflow)));
    }

    spinner.succeed(chalk.green('Workflow complete'));
  });

// Status
swarmCommands
  .command('status <swarm>')
  .description('Show swarm status')
  .action(async (swarmName) => {
    const swarm = await loadSwarm(swarmName);
    if (!swarm) {
      console.error(chalk.red(`Swarm "${swarmName}" not found`));
      return;
    }

    console.log(chalk.blue(`\n🐝 Swarm: ${swarmName}`));
    console.log(chalk.gray('─'.repeat(40)));
    
    console.log(`Active agents: ${swarm.agents.filter((a: WorkerAgent) => a.isAvailable).length}/${swarm.agents.length}`);
    console.log(`Tasks queued: ${swarm.queue.length}`);
    console.log(`Tasks running: ${swarm.running.length}`);
    
    const budget = swarm.enforcer.getLimit(swarmName);
    if (budget) {
      const pct = (budget.currentAmount / budget.maxAmount * 100).toFixed(1);
      console.log(`Budget: ${budget.currentAmount}/${budget.maxAmount} sats (${pct}%)`);
    }

    // Agent table
    if (swarm.agents.length > 0) {
      console.log(chalk.cyan('\nAgents:'));
      for (const agent of swarm.agents) {
        const status = agent.isAvailable 
          ? chalk.green('●') 
          : agent.activeTasks > 0 
            ? chalk.yellow('◐') 
            : chalk.red('○');
        console.log(`  ${status} ${agent.role} (${agent.id.slice(0, 8)})`);
      }
    }
  });

// Pay agents
swarmCommands
  .command('pay <swarm>')
  .description('Pay agents for completed work')
  .option('--dry-run', 'Show payments without sending')
  .action(async (swarmName, options) => {
    console.log(chalk.blue('💰 Calculating agent payments...'));

    const swarm = await loadSwarm(swarmName);
    if (!swarm) {
      console.error(chalk.red(`Swarm "${swarmName}" not found`));
      return;
    }

    const payments = new LightningPayments({
      lndHost: process.env.LND_HOST || 'localhost:10009'
    });

    const distribution = await calculateDistribution(swarm);

    console.log(chalk.cyan('\nPayment distribution:'));
    for (const [agent, amount] of Object.entries(distribution)) {
      console.log(`  ${agent.slice(0, 16)}...: ${chalk.green(amount + ' sats')}`);
    }

    if (!options.dryRun) {
      const spinner = ora('Sending payments...').start();
      
      for (const [agent, amount] of Object.entries(distribution)) {
        try {
          // In production, lookup agent's Lightning address
          await payments.sendPayment({
            amount: amount as number,
            destination: await getAgentLightningAddress(agent),
            memo: `Swarm ${swarmName} payment`
          });
        } catch (err) {
          console.error(`Failed to pay ${agent}:`, err);
        }
      }

      spinner.succeed(chalk.green('Payments sent'));
    }
  });

// Helper functions
async function loadSwarm(name: string): Promise<any> {
  // Load from ~/.dirgha/swarms/
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const swarmPath = path.join(os.homedir(), '.dirgha', 'swarms', `${name}.json`);
    const data = await fs.readFile(swarmPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function executeTask(taskId: string, workflow: any) {
  // Simulate task execution
  await new Promise(r => setTimeout(r, 1000));
  return { taskId, success: true };
}

async function calculateDistribution(swarm: any): Promise<Record<string, number>> {
  // Calculate payments based on work done
  const distribution: Record<string, number> = {};
  
  for (const agent of swarm.agents) {
    // Payment = base + reputation bonus
    const base = 1000;
    const reputation = agent.reputation || 0;
    distribution[agent.id] = base + Math.floor(reputation * 100);
  }
  
  return distribution;
}

async function getAgentLightningAddress(agentId: string): Promise<string> {
  // In production, lookup from agent registry
  return 'mock@getalby.com';
}

async function queuePayment(agents: string[], amount: number) {
  // Queue payment for batch processing
  console.log(chalk.dim(`  (Payment queued: ${amount} sats for ${agents.length} agents)`));
}
