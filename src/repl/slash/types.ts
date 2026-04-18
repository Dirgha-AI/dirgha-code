/**
 * repl/slash/types.ts — Type definitions for slash commands
 *
 * ReplContext re-exports from the canonical types.ts and adds
 * slash-specific helpers as optional fields so that both the
 * TUI (full context) and CLI (minimal context) can satisfy the type.
 */
import type { ReplContext, Message } from '../../types.js';
export type { ReplContext, Message };

export interface SlashCommand {
  /** Primary command name (e.g. 'diff', 'commit') */
  name?: string;
  description: string;
  args?: string;
  category?: string;
  aliases?: string[];
  /** Regex pattern for matching command input (advanced commands) */
  pattern?: RegExp;
  /** Usage examples shown in help */
  examples?: string[];
  /** Full command path string (e.g. '/net allow') — for documentation */
  command?: string;
  /** Handler - may return a string to print, or void to handle output directly */
  handler?: (...args: any[]) => string | void | Promise<string | void>;
  /** New handler - returns structured result */
  execute?: (args: string, ctx: ReplContext) => Promise<{ type: 'success' | 'error'; result: Record<string, unknown> }>;
}
