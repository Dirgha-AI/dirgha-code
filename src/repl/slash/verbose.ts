/**
 * repl/slash/verbose.ts — /verbose cycle.
 *
 * Cycles: off → new → all → verbose → off
 *   - off:     hide tool stream, show final text only
 *   - new:     show tool calls but collapse their output (default)
 *   - all:     show tool calls + truncated output
 *   - verbose: show tool calls + full output + thinking tokens
 *
 * State stored in DIRGHA_VERBOSE env var; read by StreamContainer and
 * ToolItem to adjust visible detail.
 */
import type { SlashCommand } from './types.js';
import chalk from 'chalk';

type Level = 'off' | 'new' | 'all' | 'verbose';
const ORDER: Level[] = ['off', 'new', 'all', 'verbose'];

function getLevel(): Level {
  const v = (process.env['DIRGHA_VERBOSE'] ?? 'new').toLowerCase();
  return (ORDER.includes(v as Level) ? v : 'new') as Level;
}

function setLevel(l: Level): void {
  process.env['DIRGHA_VERBOSE'] = l;
}

const verboseCommand: SlashCommand = {
  name: 'verbose',
  description: 'Cycle stream verbosity: off → new → all → verbose',
  category: 'session',
  handler: (args: string) => {
    const requested = (args ?? '').trim().toLowerCase() as Level;
    const current = getLevel();
    let next: Level;

    if (ORDER.includes(requested)) {
      next = requested;
    } else {
      // Cycle to next
      const idx = ORDER.indexOf(current);
      next = ORDER[(idx + 1) % ORDER.length]!;
    }

    setLevel(next);
    const descriptions: Record<Level, string> = {
      off:     'tool stream hidden — final text only',
      new:     'tool calls visible, output collapsed',
      all:     'tool calls + truncated output',
      verbose: 'everything including thinking tokens',
    };
    return `${chalk.cyan('verbose:')} ${chalk.bold(next)} — ${chalk.dim(descriptions[next])}`;
  },
};

export const verboseCommands: SlashCommand[] = [verboseCommand];
export { getLevel as getVerboseLevel };
export type { Level as VerboseLevel };
