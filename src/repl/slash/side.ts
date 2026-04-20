/**
 * repl/slash/side.ts — `/side <prompt>` ephemeral conversation fork.
 *
 * Runs the prompt as a sub-agent in an isolated context — no context
 * sharing, no pollution of main conversation history. Great for quick
 * tangents like "what was that API again?" without losing the main thread.
 */
import type { SlashCommand } from './types.js';
import { spawnAgent } from '../../agent/spawn-agent.js';
import { getDefaultModel } from '../../providers/detection.js';
import chalk from 'chalk';

const sideCommand: SlashCommand = {
  name: 'side',
  description: 'Run prompt in an ephemeral sub-agent (does not pollute main history)',
  category: 'workflow',
  args: '<prompt>',
  examples: ['/side what does this repo use for testing?', '/side summarize src/fleet/runtime.ts'],
  handler: async (args: string, _ctx: any) => {
    const prompt = (args ?? '').trim();
    if (!prompt) {
      return chalk.yellow('Usage: /side <prompt>\nRuns in a fresh sub-agent, no shared context.');
    }
    const model = getDefaultModel();
    const result = await spawnAgent(
      { type: 'explore', task: prompt },
      model,
    );
    if (result.error) {
      return `${chalk.red('✗')} ${result.error}`;
    }
    const body = (result.result ?? '').trim() || '(no output)';
    return (
      chalk.dim('── side fork ─────────────────────────────────────────') + '\n' +
      body + '\n' +
      chalk.dim('── end side fork (not saved to main conversation) ────')
    );
  },
};

export const sideCommands: SlashCommand[] = [sideCommand];
