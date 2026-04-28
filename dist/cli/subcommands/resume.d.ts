/**
 * `dirgha resume <session-id> [prompt...]` — reopen a previously saved
 * session and run a new turn against its history. Without a prompt
 * argument it prints the session's message count + last assistant turn
 * so users can decide whether to continue.
 *
 * Pairs with `dirgha export-session` / `import-session`. Persistence
 * lives in `~/.dirgha/sessions/<id>.jsonl`.
 */
import type { Subcommand } from './index.js';
export declare const resumeSubcommand: Subcommand;
