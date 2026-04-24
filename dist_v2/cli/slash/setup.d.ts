/**
 * /setup — minimal first-run wizard accessible from inside the REPL.
 * The full wizard (../setup.ts) uses readline and takes over stdin,
 * which is incompatible with the REPL loop. Instead, /setup shows the
 * status of each provider + points to `dirgha setup` on the CLI.
 */
import type { SlashCommand } from './types.js';
export declare const setupCommand: SlashCommand;
