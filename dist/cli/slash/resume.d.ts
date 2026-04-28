/**
 * /resume <sessionId> — load a previous session's transcript into the
 * current REPL context. Defers to SlashContext.loadSession, which
 * reads ~/.dirgha/sessions/<id>.jsonl and reports how many messages
 * were replayed. Without an id, lists available sessions.
 */
import type { SlashCommand } from './types.js';
export declare const resumeCommand: SlashCommand;
