/**
 * /history — show the prompt history from the current session. Reads
 * the session's JSONL log directly (via the context/session store in
 * ~/.dirgha/sessions) and filters down to `user` role messages.
 */
import type { SlashCommand } from './types.js';
export declare const historyCommand: SlashCommand;
