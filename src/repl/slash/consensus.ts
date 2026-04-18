// @ts-nocheck

/**
 * repl/slash/consensus.ts — Consensus slash commands
 * 
 * Commands:
 *   /consensus start <topic>       - Start consensus process
 *   /consensus vote <id> <option>   - Cast vote
 *   /consensus status <id>          - Show voting status
 *   /consensus resolve <id>         - Resolve and show result
 *   /consensus list                 - List active processes
 * 
 * @module repl/slash/consensus
 */

import type { SlashCommand, ReplContext } from './types.js';
import { ConsensusEngine } from '../../agent/collaboration/consensus.js';
import chalk from 'chalk';

// Active consensus processes
const processes = new Map<string, ConsensusEngine>();

const startCmd: SlashCommand = {
  name: 'consensus-start',
  category: 'agents',
  pattern: /^consensus start (.+)/,
  description: 'Start a consensus process with a topic/question',
  examples: ['/consensus start "Should we use TypeScript or JavaScript?"'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/consensus start (.+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /consensus start <topic>');
      return;
    }
    
    const topic = match[1].trim();
    const id = `consensus-${Date.now()}`;
    
    const engine = new ConsensusEngine({
      id,
      topic,
      agents: [], // Would be populated from active agents
      strategy: 'voting',
      quorum: 2
    });
    
    processes.set(id, engine);
    
    ctx.stream.markdown(chalk.green('✓ Started consensus process'));
    ctx.stream.markdown(`ID: ${chalk.cyan(id)}`);
    ctx.stream.markdown(`Topic: ${chalk.cyan(topic)}`);
    ctx.stream.markdown('');
    ctx.stream.markdown(chalk.dim('Commands:'));
    ctx.stream.markdown(`  /consensus vote ${id} <yes|no>`);
    ctx.stream.markdown(`  /consensus status ${id}`);
    ctx.stream.markdown(`  /consensus resolve ${id}`);
  }
};

const voteCmd: SlashCommand = {
  name: 'consensus-vote',
  category: 'agents',
  pattern: /^consensus vote (\S+) (\S+)(?:\s+(.+))?/,
  description: 'Cast a vote in a consensus process',
  examples: ['/consensus vote consensus-123 yes "TypeScript has better tooling"'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/consensus vote (\S+) (\S+)(?:\s+(.+))?/);
    if (!match) {
      ctx.stream.markdown('Usage: /consensus vote <id> <option> [reason]');
      return;
    }
    
    const [, id, option, reason] = match;
    const engine = processes.get(id);
    
    if (!engine) {
      ctx.stream.markdown(chalk.red(`Consensus process '${id}' not found`));
      return;
    }
    
    // In real implementation, this would come from the agent
    const agentId = 'cli-user';
    
    engine.addVote(agentId, option, reason);
    ctx.stream.markdown(chalk.green('✓ Vote recorded'));
    ctx.stream.markdown(`Option: ${chalk.cyan(option)}`);
    if (reason) {
      ctx.stream.markdown(`Reason: ${chalk.dim(reason)}`);
    }
  }
};

const statusCmd: SlashCommand = {
  name: 'consensus-status',
  category: 'agents',
  pattern: /^consensus status (\S+)/,
  description: 'Show consensus voting status',
  examples: ['/consensus status consensus-123'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/consensus status (\S+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /consensus status <id>');
      return;
    }
    
    const [, id] = match;
    const engine = processes.get(id);
    
    if (!engine) {
      ctx.stream.markdown(chalk.red(`Consensus process '${id}' not found`));
      return;
    }
    
    const state = engine.getState();
    
    ctx.stream.markdown(chalk.bold(`\nConsensus: ${state.topic}\n`));
    
    // Vote counts
    const counts = new Map<string, number>();
    for (const [, vote] of state.votes) {
      counts.set(vote.option, (counts.get(vote.option) || 0) + 1);
    }
    
    if (counts.size === 0) {
      ctx.stream.markdown(chalk.gray('No votes yet'));
    } else {
      ctx.stream.markdown(chalk.dim('Current votes:'));
      for (const [option, count] of counts) {
        const bar = '█'.repeat(Math.min(count, 10));
        ctx.stream.markdown(`  ${option}: ${bar} ${count}`);
      }
    }
    
    ctx.stream.markdown('');
    ctx.stream.markdown(chalk.dim(`Status: ${state.status} | Votes: ${state.votes.size}/${state.agents.length}`));
  }
};

const resolveCmd: SlashCommand = {
  name: 'consensus-resolve',
  category: 'agents',
  pattern: /^consensus resolve (\S+)/,
  description: 'Resolve consensus and show result',
  examples: ['/consensus resolve consensus-123'],
  async handler(args: string, ctx: ReplContext): Promise<void> {
    const match = args.match(/consensus resolve (\S+)/);
    if (!match) {
      ctx.stream.markdown('Usage: /consensus resolve <id>');
      return;
    }
    
    const [, id] = match;
    const engine = processes.get(id);
    
    if (!engine) {
      ctx.stream.markdown(chalk.red(`Consensus process '${id}' not found`));
      return;
    }
    
    const result = engine.resolve();
    const state = engine.getState();
    
    ctx.stream.markdown(chalk.bold(`\nConsensus Result\n`));
    ctx.stream.markdown(`Topic: ${chalk.cyan(state.topic)}`);
    ctx.stream.markdown(`Strategy: ${chalk.dim(state.strategy)}`);
    ctx.stream.markdown('');
    
    if (result.winners.length === 1) {
      ctx.stream.markdown(`${chalk.green('Winner:')} ${chalk.bold(result.winners[0])}`);
    } else if (result.winners.length > 1) {
      ctx.stream.markdown(`${chalk.yellow('Tie:')} ${result.winners.join(', ')}`);
    } else {
      ctx.stream.markdown(chalk.gray('No consensus reached'));
    }
    
    ctx.stream.markdown(chalk.dim(`\nConfidence: ${(result.confidence * 100).toFixed(1)}%`));
    
    if (result.winners.length === 1) {
      ctx.stream.markdown(chalk.dim(`\nRationale: ${result.rationale}`));
    }
  }
};

const listCmd: SlashCommand = {
  name: 'consensus-list',
  category: 'agents',
  pattern: /^consensus list/,
  description: 'List active consensus processes',
  examples: ['/consensus list'],
  async handler(_args: string, ctx: ReplContext): Promise<void> {
    if (processes.size === 0) {
      ctx.stream.markdown(chalk.gray('No active consensus processes'));
      return;
    }
    
    ctx.stream.markdown(chalk.bold('\nActive Consensus Processes:\n'));
    
    for (const [id, engine] of processes) {
      const state = engine.getState();
      const symbol = state.status === 'resolved' ? '✓' : state.status === 'expired' ? '✗' : '○';
      const color = state.status === 'resolved' ? chalk.green : state.status === 'expired' ? chalk.red : chalk.yellow;
      
      ctx.stream.markdown(`${color(symbol)} ${chalk.cyan(id)}`);
      ctx.stream.markdown(`  ${chalk.dim(state.topic.slice(0, 50))}${state.topic.length > 50 ? '...' : ''}`);
      ctx.stream.markdown(`  ${state.votes.size}/${state.agents.length} votes | ${state.status}`);
    }
  }
};

export const consensusCommands: SlashCommand[] = [
  startCmd,
  voteCmd,
  statusCmd,
  resolveCmd,
  listCmd
];
