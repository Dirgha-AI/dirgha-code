/**
 * /help — list every registered slash command from the built-in set
 * with its description. Falls back to the ambient SlashContext.showHelp
 * when the registry introspection isn't enough (e.g. commands injected
 * outside of `builtinSlashCommands`).
 */
import type { SlashCommand } from './types.js';
export declare function registerHelpSource(commands: SlashCommand[]): void;
export declare const helpCommand: SlashCommand;
