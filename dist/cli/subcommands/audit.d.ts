/**
 * `dirgha audit` — read the local audit log.
 *
 * The audit log lives at `~/.dirgha/audit/events.jsonl` (append-only
 * JSONL). Other parts of the CLI (tool approval, destructive actions,
 * auth) are expected to append records here; this command is read-only.
 *
 * Subcommands:
 *   list [N]          Show the last N entries (default 20).
 *   tail              Follow the log (blocks, prints new entries live).
 *   search <query>    Print entries whose JSON includes `query`.
 * `--json` emits structured output instead of the table renderer.
 */
import type { Subcommand } from './index.js';
export declare const auditSubcommand: Subcommand;
