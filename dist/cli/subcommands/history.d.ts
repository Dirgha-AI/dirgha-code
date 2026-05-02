/**
 * `dirgha history [query]` — browse and search local chat history.
 *
 * With no arguments: lists recent sessions from ~/.dirgha/dirgha.db.
 * With a query: full-text searches all messages via SQLite FTS5.
 */
import type { Subcommand } from "./index.js";
export declare const historySubcommand: Subcommand;
