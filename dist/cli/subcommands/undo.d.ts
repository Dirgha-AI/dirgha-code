/**
 * `dirgha undo [N]` — discard the last N turns from a session.
 *
 * Sessions are append-only JSONL at `~/.dirgha/sessions/<id>.jsonl`.
 * "Undo" is implemented as a non-destructive rewrite: read the log,
 * count back N user-turns, snapshot the original to `<id>.jsonl.bak`,
 * write the truncated history. Future `dirgha resume <id>` then sees
 * the rolled-back state.
 *
 * Without --session, the most-recently-modified session is used.
 *
 * Closes parity-matrix row 16. We can't assume a clean git repo for
 * every workspace, so the session log is the source of truth — each
 * undo rewinds the JSONL to the chosen turn boundary.
 */
import type { Subcommand } from './index.js';
export declare const undoSubcommand: Subcommand;
