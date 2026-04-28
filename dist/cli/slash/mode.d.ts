/**
 * /mode — switch the REPL's execution mode. The mode is prepended to
 * the system prompt of every subsequent turn via the interactive loop,
 * which reads ctx.mode / ctx.setMode on each submit. Preference
 * persists to ~/.dirgha/config.json so new sessions honour it.
 */
import type { SlashCommand } from './types.js';
export declare const modeCommand: SlashCommand;
