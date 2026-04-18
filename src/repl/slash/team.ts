// @ts-nocheck
/**
 * repl/slash/team.ts — Team management slash commands
 * 
 * Commands:
 *   /team create <name>        - Create new agent team
 *   /team add <team> <agent>   - Add agent to team
 *   /team remove <team> <agent> - Remove agent from team
 *   /team list                 - List all teams
 *   /team run <team> <goal>    - Execute team with goal
 *   /team status <team>        - Show team status
 * 
 * @module repl/slash/team
 */

import type { SlashCommand, ReplContext } from './types.js';
import { AgentPool } from '../../agent/orchestration/agent-pool.js';
import { Team, getGlobalRegistry, createTeam, removeTeam } from '../../agent/orchestration/decomposer.js';
import { runDAG } from '../../agent/orchestration/dag-runner.js';
import chalk from 'chalk';

// Team registry (in-memory for now, could persist to disk)
const teams = new Map<string, Team>();

const createCmd: SlashCommand = {
  name: 'team-create',
  description: 'Create a new agent team',
  args: '<name> [specialty]',
  category: 'orchestration',
  aliases: ['team create'],
  async handler(args: string, ctx: ReplContext): Promise<string> {
    const parts = args.trim().split(' ');
    const name = parts[0];
    const specialty = parts[1];
    
    if (!name) {
      return 'Usage: /team create <name> [specialty]';
    }
    
    if (teams.has(name)) {
      return chalk.red(`Team '${name}' already exists`);
    }
    
    const team = createTeam({
      id: name,
      name,
      agents: []
    });
    
    teams.set(name, team);
    
    return [
      chalk.green(`✓ Created team '${name}'${specialty ? ` (${specialty})` : ''}`),
      `Add agents: /team add ${name} <agent-name>`
    ].join('\n');
  }
};

const addCmd: SlashCommand = {
  name: 'team-add',
  description: 'Add agent to team',
  args: '<team> <agent>',
  category: 'orchestration',
  aliases: ['team add'],
  async handler(args: string, ctx: ReplContext): Promise<string> {
    const parts = args.trim().split(' ');
    const teamName = parts[0];
    const agentName = parts[1];
    
    if (!teamName || !agentName) {
      return 'Usage: /team add <team> <agent>';
    }
    
    const team = teams.get(teamName);
    
    if (!team) {
      return chalk.red(`Team '${teamName}' not found`);
    }
    
    // Check if agent exists in pool
    const pool = AgentPool.getInstance();
    const agent = pool.getAgents().find(a => a.name === agentName);
    
    if (!agent) {
      return chalk.yellow(`Agent '${agentName}' not in pool. Create with /agent create first`);
    }
    
    team.agents.push(agent);
    return [
      chalk.green(`✓ Added ${chalk.cyan(agentName)} to ${chalk.cyan(teamName)}`),
      `Team now has ${team.agents.length} agent(s)`
    ].join('\n');
  }
};

const removeCmd: SlashCommand = {
  name: 'team-remove',
  description: 'Remove agent from team',
  args: '<team> <agent>',
  category: 'orchestration',
  aliases: ['team remove'],
  async handler(args: string, ctx: ReplContext): Promise<string> {
    const parts = args.trim().split(' ');
    const teamName = parts[0];
    const agentName = parts[1];
    
    if (!teamName || !agentName) {
      return 'Usage: /team remove <team> <agent>';
    }
    
    const team = teams.get(teamName);
    
    if (!team) {
      return chalk.red(`Team '${teamName}' not found`);
    }
    
    const idx = team.agents.findIndex(a => a.name === agentName);
    if (idx === -1) {
      return chalk.yellow(`Agent '${agentName}' not in team '${teamName}'`);
    }
    
    team.agents.splice(idx, 1);
    return chalk.green(`✓ Removed ${chalk.cyan(agentName)} from ${chalk.cyan(teamName)}`);
  }
};

const listCmd: SlashCommand = {
  name: 'team-list',
  description: 'List all teams',
  category: 'orchestration',
  aliases: ['team list', 'teams'],
  async handler(_args: string, ctx: ReplContext): Promise<string> {
    if (teams.size === 0) {
      return [
        chalk.gray('No teams created yet'),
        'Create one: /team create <name>'
      ].join('\n');
    }
    
    const lines = [chalk.bold('Teams:'), ''];
    for (const [name, team] of teams) {
      const status = team.agents.length > 0 ? chalk.green('●') : chalk.gray('○');
      lines.push(`${status} ${chalk.cyan(name)}: ${team.agents.length} agent(s)`);
    }
    
    lines.push('', chalk.dim('● active | ○ empty'));
    return lines.join('\n');
  }
};

const runCmd: SlashCommand = {
  name: 'team-run',
  description: 'Execute team with a goal (auto-decomposes tasks)',
  args: '<team> <goal>',
  category: 'orchestration',
  aliases: ['team run'],
  async handler(args: string, ctx: ReplContext): Promise<string> {
    const parts = args.trim().split(' ');
    const teamName = parts[0];
    const goal = parts.slice(1).join(' ').trim();
    
    if (!teamName || !goal) {
      return 'Usage: /team run <team> <goal>';
    }
    
    const team = teams.get(teamName);
    
    if (!team) {
      return chalk.red(`Team '${teamName}' not found`);
    }
    
    if (team.agents.length === 0) {
      return [
        chalk.yellow(`Team '${teamName}' has no agents`),
        `Add agents: /team add ${teamName} <agent>`
      ].join('\n');
    }
    
    const lines = [
      chalk.bold(`🚀 Running team '${teamName}' on goal:`),
      chalk.cyan(goal),
      '',
      chalk.dim('Auto-decomposing goal into tasks...')
    ];
    
    // Get decomposer from pool
    const pool = AgentPool.getInstance();
    const decomposer = pool.getDecomposer();
    
    try {
      // Decompose goal into task DAG
      const dag = await decomposer(goal, {
        dependencies: 'auto',
        maxConcurrency: Math.min(team.agents.length, 5),
        parallelThreshold: 3,
        agentCount: team.agents.length
      });
      
      lines.push(chalk.green(`✓ Created DAG with ${dag.tasks.length} tasks`));
      
      // Run the DAG with the team
      const results = await runDAG(dag, {
        agentPool: pool,
        onProgress: (id, status) => {
          const symbol = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '○';
          const color = status === 'completed' ? chalk.green : status === 'failed' ? chalk.red : chalk.yellow;
          ctx.print(color(`${symbol} Task ${id}: ${status}`));
        },
        onError: (id, error) => {
          ctx.print(chalk.red(`✗ Task ${id} failed: ${error.message}`));
        }
      });
      
      // Summary
      const completed = results.filter(r => r.status === 'completed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      
      lines.push('', chalk.bold('Results:'));
      lines.push(`${chalk.green('✓')} ${completed} completed`);
      if (failed > 0) {
        lines.push(`${chalk.red('✗')} ${failed} failed`);
      }
      
      return lines.join('\n');
      
    } catch (error) {
      return chalk.red(`Error: ${(error as Error).message}`);
    }
  }
};

const statusCmd: SlashCommand = {
  name: 'team-status',
  description: 'Show team status and agent health',
  args: '<team>',
  category: 'orchestration',
  aliases: ['team status'],
  async handler(args: string, ctx: ReplContext): Promise<string> {
    const teamName = args.trim();
    
    if (!teamName) {
      return 'Usage: /team status <team>';
    }
    
    const team = teams.get(teamName);
    
    if (!team) {
      return chalk.red(`Team '${teamName}' not found`);
    }
    
    const lines = [chalk.bold(`Team: ${teamName}`), ''];
    
    if (team.agents.length === 0) {
      lines.push(chalk.gray('No agents assigned'));
      return lines.join('\n');
    }
    
    const pool = AgentPool.getInstance();
    
    lines.push(chalk.dim('Agents:'));
    for (const agent of team.agents) {
      const status = pool.getAgentStatus(agent.id);
      const state = status?.state || 'unknown';
      const symbol = state === 'running' ? '🟢' : state === 'idle' ? '⚪' : '🔴';
      lines.push(`  ${symbol} ${chalk.cyan(agent.name)} (${state})`);
    }
    
    lines.push('', chalk.dim('Pool stats:'));
    const stats = pool.getStats();
    lines.push(`  Active: ${stats.activeAgents} | Available: ${stats.availableAgents} | Queue: ${stats.queueLength}`);
    
    return lines.join('\n');
  }
};

export const teamCommands: SlashCommand[] = [
  createCmd,
  addCmd,
  removeCmd,
  listCmd,
  runCmd,
  statusCmd
];
