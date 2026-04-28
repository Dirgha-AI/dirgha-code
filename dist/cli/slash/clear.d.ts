/**
 * /clear — clear the in-memory transcript. Delegates to the core
 * SlashContext.clear() which is already wired to drop the history
 * array and print an acknowledgement. The on-disk session is kept so
 * the conversation remains replayable later.
 */
import type { SlashCommand } from './types.js';
export declare const clearCommand: SlashCommand;
