/**
 * `dirgha compact [sessionId]` — force-compact a session on disk.
 *
 * Reads the session JSONL, drops intermediate tool-result and thinking
 * parts from older messages, and appends a `compaction` entry that
 * records the rough token savings. The in-repl compaction pass is
 * richer (LLM summarisation), but this is intentionally offline: safe
 * to run without any provider access.
 *
 * When `sessionId` is omitted we pick the most recently modified
 * session in `~/.dirgha/sessions/`.
 */
import type { Subcommand } from './index.js';
export declare const compactSubcommand: Subcommand;
