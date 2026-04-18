/**
 * repl/slash/local.ts — /local and /setup local slash commands
 */
import type { SlashCommand } from './types.js';
import { handleLocalCommand } from '../../commands/local.js';
import { handleSetupLocalCommand } from '../../commands/setup-local.js';

export const localCommands: SlashCommand[] = [
  {
    name: 'local',
    description: 'Show local AI (llama-server) status and model info',
    category: 'config',
    handler: async (_args, ctx) => {
      await handleLocalCommand(ctx, _args);
      return '';
    },
  },
  {
    name: 'setup',
    description: 'Set up offline/local AI — detect hardware and download a model',
    args: '[local]',
    category: 'config',
    handler: async (_args, ctx) => {
      await handleSetupLocalCommand(ctx);
      return '';
    },
  },
];
