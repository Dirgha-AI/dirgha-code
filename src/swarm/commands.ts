// @ts-nocheck
/**
 * swarm/commands.ts — CLI commands for swarm management
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { ColonyManager } from './orchestration/ColonyManager.js';
import { CostOptimizer, BudgetEnforcer } from './governance/CostOptimizer.js';
import { SALESFORCE_DOMAINS, generateProjectPlan } from './templates/SalesforceDomains.js';

let activeColony: ColonyManager | null = null;

export function registerSwarmCommands(program: Command): void {
  const swarm = program
    .command('swarm')
    .description('Multi-agent swarm management');
  
  swarm
    .command('init <name>')
    .description('Initialize a new agent colony')
    .option('-d, --domains <domains...>', 'Domains to include', ['platform'])
    .option('-b, --budget <amount>', 'Total budget in USD', '50000')
    .option('-a, --agents <count>', 'Max agents', '50')
    .action((name: string, options: { domains: string[]; budget: string; agents: string }) => {
      activeColony = new ColonyManager({
        name,
        domains: options.domains as any[],
        maxAgents: parseInt(options.agents),
        budget: {
          total: parseInt(options.budget),
          spent: 0,
          remaining: parseInt(options.budget),
          dailyLimit: 2000,
          emergencyReserve: 5000,
        },
      });
      
      console.log(chalk.green(`✓ Colony "${name}" initialized`));
      console.log(chalk.dim(`  Domains: ${options.domains.join(', ')}`));
      console.log(chalk.dim(`  Budget: $${options.budget}`));
      console.log(chalk.dim(`  Max Agents: ${options.agents}`));
    });
  
  swarm
    .command('status')
    .description('Show colony status')
    .action(() => {
      if (!activeColony) {
        console.log(chalk.red('No active colony. Run: dirgha swarm init <name>'));
        return;
      }
      
      const status = activeColony.getStatus();
      const metrics = activeColony.getMetrics();
      
      console.log(chalk.blue(`\n📊 Colony: ${status.name}`));
      console.log(chalk.dim('─'.repeat(40)));
      
      console.log(chalk.yellow('\nTasks:'));
      console.log(`  Pending: ${chalk.white(status.tasks.pending)}`);
      console.log(`  In Progress: ${chalk.white(status.tasks.inProgress)}`);
      console.log(`  Completed: ${chalk.green(status.tasks.completed)}`);
      console.log(`  Failed: ${chalk.red(status.tasks.failed)}`);
      
      console.log(chalk.yellow('\nBudget:'));
      console.log(`  Spent: ${chalk.red(`$${status.budget.spent.toFixed(2)}`)}`);
      console.log(`  Remaining: ${chalk.green(`$${status.budget.remaining.toFixed(2)}`)}`);
      
      console.log(chalk.yellow('\nAgents:'));
      console.log(`  Total: ${chalk.white(status.agents.total)}`);
      console.log(`  Busy: ${chalk.yellow(status.agents.busy)}`);
      console.log(`  Idle: ${chalk.green(status.agents.idle)}`);
      
      console.log(chalk.yellow('\nQuality:'));
      console.log(`  Avg Duration: ${chalk.white(`${(metrics.averageTaskDuration / 1000).toFixed(1)}s`)}`);
      console.log(`  Cost/Task: ${chalk.white(`$${metrics.costPerTask.toFixed(2)}`)}`);
    });
  
  swarm
    .command('task <title>')
    .description('Add a task to the colony')
    .option('-d, --domain <domain>', 'Domain', 'platform')
    .option('-c, --complexity <0-1>', 'Complexity', '0.5')
    .option('--critical', 'Mark as critical')
    .option('--security', 'Security-critical')
    .action((title: string, options: any) => {
      if (!activeColony) {
        console.log(chalk.red('No active colony. Run: dirgha swarm init <name>'));
        return;
      }
      
      const task = activeColony.addTask({
        type: 'feature',
        title,
        description: title,
        acceptanceCriteria: [],
        domain: options.domain,
        complexity: parseFloat(options.complexity),
        critical: options.critical || false,
        securityCritical: options.security || false,
        estimatedCost: 0,
        estimatedDuration: 0,
      });
      
      console.log(chalk.green(`✓ Task added: ${task.id}`));
      console.log(chalk.dim(`  Domain: ${options.domain}`));
      console.log(chalk.dim(`  Complexity: ${options.complexity}`));
    });
  
  swarm
    .command('run')
    .description('Process task queue')
    .action(async () => {
      if (!activeColony) {
        console.log(chalk.red('No active colony. Run: dirgha swarm init <name>'));
        return;
      }
      
      console.log(chalk.blue('▶ Processing queue...'));
      await activeColony.processQueue();
      console.log(chalk.green('✓ Queue processed'));
    });
  
  swarm
    .command('critical-path')
    .description('Show critical path tasks')
    .action(() => {
      if (!activeColony) {
        console.log(chalk.red('No active colony. Run: dirgha swarm init <name>'));
        return;
      }
      
      const critical = activeColony.findCriticalPath();
      console.log(chalk.yellow('Critical Path Tasks:'));
      critical.forEach((id, i) => {
        console.log(`  ${i + 1}. ${id}`);
      });
    });
  
  swarm
    .command('salesforce-plan')
    .description('Show Salesforce clone project plan')
    .action(() => {
      console.log(chalk.blue(generateProjectPlan()));
      
      console.log(chalk.yellow('\n\nDomains:'));
      SALESFORCE_DOMAINS.forEach(d => {
        console.log(`  ${chalk.white(d.name)}: ${d.agents} agents, ${d.duration}`);
      });
    });
  
  swarm
    .command('optimize')
    .description('Run cost optimization on queue')
    .action(() => {
      if (!activeColony) {
        console.log(chalk.red('No active colony. Run: dirgha swarm init <name>'));
        return;
      }
      
      const optimizer = new CostOptimizer();
      const tasks = []; // Would get from colony
      
      optimizer.optimize(tasks).then(result => {
        console.log(chalk.blue('Optimization Results:'));
        console.log(`  Estimated Cost: ${chalk.white(`$${result.estimatedCost.toFixed(2)}`)}`);
        console.log(`  Estimated Time: ${chalk.white(`${result.estimatedTime.toFixed(0)}s`)}`);
        console.log(`  Tasks: ${chalk.white(result.queue.length)}`);
      });
    });
}
