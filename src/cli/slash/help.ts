/**
 * /help — list every registered slash command from the built-in set
 * with its description. Falls back to the ambient SlashContext.showHelp
 * when the registry introspection isn't enough (e.g. commands injected
 * outside of `builtinSlashCommands`).
 */

import type { SlashCommand } from './types.js';

// Lazy reference to the command list to avoid circular imports.
let registry: SlashCommand[] | undefined;

export function registerHelpSource(commands: SlashCommand[]): void {
  registry = commands;
}

export const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show every slash command',
  aliases: ['?'],
  async execute(_args, ctx) {
    const lines = ['Slash commands:'];
    if (registry && registry.length > 0) {
      const sorted = [...registry].sort((a, b) => a.name.localeCompare(b.name));
      for (const cmd of sorted) {
        const alias = cmd.aliases && cmd.aliases.length > 0 ? `  (aliases: ${cmd.aliases.map(a => '/' + a).join(', ')})` : '';
        lines.push(`  /${cmd.name.padEnd(10)}  ${cmd.description}${alias}`);
      }
    }
    lines.push('');
    lines.push('REPL built-ins from the core registry:');
    lines.push(ctx.showHelp());
    return lines.join('\n');
  },
};
