/**
 * `dirgha import-session <path>` — load a session JSON into the store.
 *
 * Accepts both the native export format (`{ id, entries, messages }`
 * from `dirgha export-session`) and a bare array of messages (legacy
 * v1 exports). Writes a fresh session file under
 * `~/.dirgha/sessions/<new-uuid>.jsonl` and prints the new id so the
 * caller can `/session load <id>` from the REPL.
 */
import type { Subcommand } from './index.js';
export declare const importSessionSubcommand: Subcommand;
