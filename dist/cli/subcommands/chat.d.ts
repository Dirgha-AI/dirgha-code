/**
 * `dirgha chat "prompt"` — pure LLM chat, no tool calls.
 *
 * Skips the agent loop entirely: opens a streaming provider connection,
 * prints text deltas as they arrive, and exits. No tool execution, no
 * session persistence (beyond the transient event prints). Useful for
 * quick Q&A where you explicitly do *not* want the agent touching the
 * filesystem or shelling out.
 *
 * Flags mirror the one-shot path on main.ts: `-m`, `-s`, `--json`.
 */
import type { Subcommand } from './index.js';
export declare const chatSubcommand: Subcommand;
