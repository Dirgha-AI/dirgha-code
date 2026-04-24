/**
 * /fleet — shortcut to the fleet command. v2 doesn't ship a fleet
 * module yet; delegate to the out-of-band CLI runner once it exists.
 * STUB: print the equivalent shell invocation and exit.
 */

import type { SlashCommand } from './types.js';

export const fleetCommand: SlashCommand = {
  name: 'fleet',
  description: 'Dispatch to the fleet command (beta: run `dirgha fleet`)',
  async execute(args) {
    const tail = args.length > 0 ? ` ${args.join(' ')}` : '';
    return [
      'Fleet control isn\'t available inside the REPL in this beta.',
      '',
      'Run from a shell:',
      `  dirgha fleet${tail}`,
      '',
      'Fleet manages long-running agent swarms — track status at',
      '  https://dirgha.ai/app/fleet',
    ].join('\n');
  },
};
