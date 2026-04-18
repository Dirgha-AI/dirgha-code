// @ts-nocheck

/**
 * repl/slash/agent-discovery.ts — Agent discovery slash commands
 * 
 * Commands:
 *   /agent list              - List all available agents
 *   /agent discover <capability> - Find agents by capability
 *   /agent create <name>     - Create new agent
 *   /agent destroy <name>    - Destroy agent
 *   /agent connect <name>    - Connect to running agent
 *   /agent info <name>       - Show agent details
 * 
 * @module repl/slash/agent-discovery
 */

import type { SlashCommand, ReplContext } from './types.js';
import { AgentPool } from '../../agent/orchestration/agent-pool.js';
import { globalRegistry } from '../../gateway/acp/registry.js';
import chalk from 'chalk';

const listCmd: SlashCommand = {
  name: 'agent-list',
  category: 'agents',
  pattern: /^agent list/,
  description: 'List all available agents',
  examples: ['/agent list'],
  async handler(_args: string, ctx: ReplContext): Promise<void> {
    const pool = AgentPool.getInstance();
    const agents = pool.getAgents();
    
    if (agents.length === 0) {
      ctx.stream.markdown(chalk.gray('No agents in pool'));
      ctx.stream.markdown('Create one: /agent create <name>');
      return;
    }
    
    ctx.stream.markdown(chalk.bold('\nAgent Pool:\n'));
    
    for (const agent of agents) {
      const status = pool.getAgentStatus(agent.id);
      const state = status?.state || 'unknown';
      const symbol = state === 'running' ? '🟢' : state === 'idle' ? '⚪' : '🔴';
      const capabilities = agent.capabilities?.slice(0, 3).join(', ') || 'none';
      
      ctx.stream.markdown(`${symbol} ${chalk.cyan(agent.name)}`);
      ctx.stream.markdown(`  ${chalk.dim(agent.description || 'No description')}`);
      ctx.stream.markdown(`  ${chalk.dim('State:')} ${state} | ${chalk.dim('Caps:')} ${capabilities}`);
      
      if (status?.metrics) {
        const { tasksCompleted, tasksFailed } = status.metrics;
        ctx.stream.markdown(`  ${chalk.dim('Tasks:')} ${tasksCompleted}✓ ${tasksFailed > 0 ? `${tasksFailed}✗` : ''}`);
      }
    }
    
    ctx.stream.markdown('');
    const stats = pool.getStats();
    ctx.stream.markdown(chalk.dim(`Total: ${stats.totalAgents} | Active: ${stats.activeAgents} | Available: ${stats.availableAgents}`));
  }
};

const discoverCmd: SlashCommand = {
  name: 'agent-discover',
  category: 'agents',
  pattern: /^agent discover (.+)/,
  description: 'Find agents by capability',
  examples: ['/agent discover typescript', '/agent discover "code review"'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/agent discover (.+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /agent discover <capability>');
      return;
    }
    
    const capability = match[1].trim().toLowerCase();
    const pool = AgentPool.getInstance();
    const agents = pool.getAgents();
    
    // Find matching agents
    const matches = agents.filter(agent => 
      agent.capabilities?.some(cap => 
        cap.toLowerCase().includes(capability) || 
        capability.includes(cap.toLowerCase())
      )
    );
    
    // Also check ACP registry
    const acpMatches = globalRegistry.findByCapability(capability);
    
    ctx.stream.markdown(chalk.bold(`\nAgents with '${capability}' capability:\n`));
    
    if (matches.length === 0 && acpMatches.length === 0) {
      ctx.stream.markdown(chalk.gray('No agents found'));
      ctx.stream.markdown('Create one: /agent create <name>');
      return;
    }
    
    // Show pool agents
    if (matches.length > 0) {
      ctx.stream.markdown(chalk.dim('Local pool:'));
      for (const agent of matches) {
        const status = pool.getAgentStatus(agent.id);
        ctx.stream.markdown(`  • ${chalk.cyan(agent.name)} (${status?.state || 'unknown'})`);
      }
    }
    
    // Show ACP registry agents
    if (acpMatches.length > 0) {
      ctx.stream.markdown(chalk.dim('\\nACP Registry:'));
      for (const agent of acpMatches) {
        ctx.stream.markdown(`  • ${chalk.cyan(agent.id)} @ ${agent.endpoint}`);
      }
    }
  }
};

const createCmd: SlashCommand = {
  name: 'agent-create',
  category: 'agents',
  pattern: /^agent create (\S+)(?:\s+(.+))?/,
  description: 'Create new agent with optional capabilities',
  examples: ['/agent create reviewer typescript code-review', '/agent create architect system-design'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/agent create (\S+)(?:\s+(.+))?/);
    if (!match) {
      ctx.stream.markdown('Usage: /agent create <name> [capabilities...]');
      return;
    }
    
    const [, name, capsStr] = match;
    const capabilities = capsStr ? capsStr.split(/\s+/) : [];
    
    const pool = AgentPool.getInstance();
    
    try {
      const agent = await pool.createAgent({
        name,
        capabilities,
        maxConcurrent: 1,
        idleTimeoutMs: 300000 // 5 min
      });
      
      ctx.stream.markdown(chalk.green(`✓ Created agent '${name}'`));
      if (capabilities.length > 0) {
        ctx.stream.markdown(`Capabilities: ${capabilities.join(', ')}`);
      }
      
      // Start the agent
      await pool.startAgent(agent.id);
      ctx.stream.markdown(chalk.dim('Agent started and ready'));
      
    } catch (error) {
      ctx.stream.markdown(chalk.red(`Failed to create agent: ${(error as Error).message}`));
    }
  }
};

const destroyCmd: SlashCommand = {
  name: 'agent-destroy',
  category: 'agents',
  pattern: /^agent destroy (\S+)/,
  description: 'Destroy an agent',
  examples: ['/agent destroy reviewer'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/agent destroy (\S+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /agent destroy <name>');
      return;
    }
    
    const [, name] = match;
    const pool = AgentPool.getInstance();
    const agent = pool.getAgents().find(a => a.name === name);
    
    if (!agent) {
      ctx.stream.markdown(chalk.red(`Agent '${name}' not found`));
      return;
    }
    
    ctx.stream.markdown(chalk.yellow(`Destroying agent '${name}'...`));
    
    try {
      await pool.destroyAgent(agent.id);
      ctx.stream.markdown(chalk.green(`✓ Agent '${name}' destroyed`));
    } catch (error) {
      ctx.stream.markdown(chalk.red(`Failed: ${(error as Error).message}`));
    }
  }
};

const connectCmd: SlashCommand = {
  name: 'agent-connect',
  category: 'agents',
  pattern: /^agent connect (\S+)/,
  description: 'Connect to running agent',
  examples: ['/agent connect reviewer'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/agent connect (\S+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /agent connect <name>');
      return;
    }
    
    const [, name] = match;
    const pool = AgentPool.getInstance();
    const agent = pool.getAgents().find(a => a.name === name);
    
    if (!agent) {
      ctx.stream.markdown(chalk.red(`Agent '${name}' not found`));
      return;
    }
    
    const status = pool.getAgentStatus(agent.id);
    
    if (status?.state !== 'running') {
      ctx.stream.markdown(chalk.yellow(`Agent '${name}' is not running`));
      ctx.stream.markdown(`Start with: /agent start ${name}`);
      return;
    }
    
    ctx.stream.markdown(chalk.green(`Connected to '${name}'`));
    ctx.stream.markdown(chalk.dim(`Session: ${agent.id}`));
    ctx.stream.markdown('');
    ctx.stream.markdown('Type messages to send to agent. Use /disconnect to exit.');
  }
};

const infoCmd: SlashCommand = {
  name: 'agent-info',
  category: 'agents',
  pattern: /^agent info (\S+)/,
  description: 'Show agent details',
  examples: ['/agent info reviewer'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/agent info (\S+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /agent info <name>');
      return;
    }
    
    const [, name] = match;
    const pool = AgentPool.getInstance();
    const agent = pool.getAgents().find(a => a.name === name);
    
    if (!agent) {
      ctx.stream.markdown(chalk.red(`Agent '${name}' not found`));
      return;
    }
    
    const status = pool.getAgentStatus(agent.id);
    const metrics = status?.metrics;
    
    ctx.stream.markdown(chalk.bold(`\nAgent: ${name}\n`));
    ctx.stream.markdown(`ID: ${chalk.dim(agent.id)}`);
    ctx.stream.markdown(`State: ${status?.state || 'unknown'}`);
    ctx.stream.markdown(`Created: ${new Date(agent.createdAt).toLocaleString()}`);
    ctx.stream.markdown('');
    
    if (agent.capabilities && agent.capabilities.length > 0) {
      ctx.stream.markdown(chalk.dim('Capabilities:'));
      for (const cap of agent.capabilities) {
        ctx.stream.markdown(`  • ${cap}`);
      }
      ctx.stream.markdown('');
    }
    
    if (metrics) {
      ctx.stream.markdown(chalk.dim('Metrics:'));
      ctx.stream.markdown(`  Tasks: ${metrics.tasksCompleted} completed, ${metrics.tasksFailed} failed`);
      ctx.stream.markdown(`  Uptime: ${Math.floor(metrics.uptimeMs / 1000 / 60)} minutes`);
      if (metrics.averageResponseTimeMs) {
        ctx.stream.markdown(`  Avg response: ${Math.round(metrics.averageResponseTimeMs)}ms`);
      }
    }
  }
};

export const agentDiscoveryCommands: SlashCommand[] = [
  listCmd,
  discoverCmd,
  createCmd,
  destroyCmd,
  connectCmd,
  infoCmd
];
