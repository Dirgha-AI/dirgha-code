/**
 * `dirgha export-session <id> [path]` — dump a session to a JSON file.
 *
 * Reads the JSONL log for `<id>` from `~/.dirgha/sessions/`, reassembles
 * it into a single JSON document with `{ id, entries, messages }`, and
 * writes it to `path`. A path of `-` streams to stdout. The export is
 * lossless enough that `dirgha import-session` can round-trip it.
 */
import type { Subcommand } from './index.js';
export declare const exportSessionSubcommand: Subcommand;
