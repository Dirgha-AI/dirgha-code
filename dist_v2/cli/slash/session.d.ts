/**
 * /session — list sessions, rename one, or branch from the current
 * session. The core SlashContext has list/load helpers; rename and
 * branch are handled at the file-system level (rename) or via a
 * stub message (branch, because branching needs a provider pointer
 * that we don't have access to here).
 */
import type { SlashCommand } from './types.js';
export declare const sessionCommand: SlashCommand;
