/**
 * /exit, /quit — leave the REPL cleanly. Delegates to
 * SlashContext.exit(), which already closes readline and calls
 * process.exit with the supplied code.
 */
import type { SlashCommand } from './types.js';
export declare const exitCommand: SlashCommand;
