/**
 * business/commands.ts — Business context CLI commands
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentContext, getOrg, getProject } from './context.js';
import { getUsage } from './billing.js';
import { getTeamMembers } from './teams.js';

export function registerBusinessCommands(program: Command): void {
  program
    .command('context')
    .description('Show current business context')
    .action(() => {
      const { org, project } = getCurrentContext();
      
      console.log(chalk.bold('Business Context:'));
      if (org) {
        console.log(chalk.dim(`  Org: ${org.name} (${org.tier})`));
      }
      if (project) {
        console.log(chalk.dim(`  Project: ${project.name}`));
      }
      if (!org && !project) {
        console.log(chalk.yellow('  No context set. Use:'));
        console.log(chalk.dim('    export DIRGHA_ORG_ID=<org-id>'));
        console.log(chalk.dim('    export DIRGHA_PROJECT_ID=<project-id>'));
      }
    });

  program
    .command('usage')
    .description('Show usage for current org/project')
    .option('-o, --org <id>', 'Organization ID')
    .option('-p, --project <id>', 'Project ID')
    .action((options: { org?: string; project?: string }) => {
      const orgId = options.org || getCurrentContext().org?.id;
      if (!orgId) {
        console.log(chalk.red('No org specified. Use --org or set DIRGHA_ORG_ID'));
        return;
      }
      
      const usage = getUsage(orgId, options.project);
      console.log(chalk.bold('Usage:'));
      console.log(chalk.dim(`  Tokens: ${usage.tokens.toLocaleString()}`));
      console.log(chalk.dim(`  Cost: $${usage.cost.toFixed(2)}`));
      console.log(chalk.dim(`  API calls: ${usage.calls}`));
    });

  program
    .command('team')
    .description('List team members')
    .option('-o, --org <id>', 'Organization ID')
    .action((options: { org?: string }) => {
      const orgId = options.org || getCurrentContext().org?.id;
      if (!orgId) {
        console.log(chalk.red('No org specified'));
        return;
      }
      
      const members = getTeamMembers(orgId);
      console.log(chalk.bold(`Team (${members.length} members):`));
      for (const m of members) {
        const roleColor = m.role === 'admin' ? chalk.red : chalk.dim;
        console.log(chalk.dim(`  ${roleColor(m.role)} ${m.email}`));
      }
    });
}
