/**
 * /memory — operate on the long-term memory store at ~/.dirgha/memory.
 * Subcommands: list, show <id>, add <id> <description>, remove <id>,
 * search <query>. Bodies for `add` come from the args after the
 * description and are stored as markdown.
 */
import type { SlashCommand } from './types.js';
export declare const memoryCommand: SlashCommand;
