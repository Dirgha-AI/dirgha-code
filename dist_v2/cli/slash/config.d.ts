/**
 * /config — show or edit the DIRGHA.md in the current directory
 * inline. Subcommands: show (default), append <text>, path.
 * For destructive edits (rewrite) the command refuses and points at
 * /init --force.
 */
import type { SlashCommand } from './types.js';
export declare const configCommand: SlashCommand;
