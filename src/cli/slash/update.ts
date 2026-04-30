/**
 * /update — check the npm registry for a newer @dirgha/code, print the
 * comparison, and tell the user how to upgrade. We don't shell out to
 * npm from inside the REPL — running `npm i -g …` mid-session can
 * leave the binary half-replaced — so this is informational + nudges
 * the user to run `dirgha update` from a clean shell.
 */

import { createRequire } from 'node:module';
import { checkLatestVersion } from '../subcommands/update.js';
import type { SlashCommand } from './types.js';

const CLI_VERSION: string = (() => {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../../../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0-dev';
  } catch { return '0.0.0-dev'; }
})();

export const updateCommand: SlashCommand = {
  name: 'update',
  aliases: ['up'],
  description: 'Check for a newer @dirgha/code on npm',
  async execute(_args, _ctx) {
    const result = await checkLatestVersion({ currentVersion: CLI_VERSION });
    if (result.error || !result.latest) {
      return `update check failed: ${result.error ?? 'no version returned by registry'}`;
    }
    if (!result.outdated) {
      return `@dirgha/code ${result.current} — up to date.`;
    }
    return [
      `@dirgha/code ${result.current} → ${result.latest} (newer available)`,
      '',
      'To upgrade, exit this REPL and run:',
      '  dirgha update --yes',
      '',
      'Or directly via npm:',
      '  npm i -g @dirgha/code@latest',
    ].join('\n');
  },
};
