/**
 * compaction/index.ts — Public API for the compaction subsystem.
 *
 * Wires together prune → protect → summarize → update phases.
 * Used by error-recovery and slash /compact commands.
 */
import type { Message } from '../types.js';
import { pruneToolOutputs } from './prune.js';
import { protectMessages } from './protect.js';
import { summarizeWithLLM } from './summarize.js';
import { updateContext } from './update.js';

export interface CompactionOptions {
  mode?: 'standard' | 'aggressive';
  preserveRecent?: number;
  model?: string;
}

/** Run the compaction pipeline on the provided messages (or no-ops if none supplied). */
export async function compactSession(
  options: CompactionOptions = {},
  messages: Message[] = [],
): Promise<Message[]> {
  const { mode = 'standard', model = 'claude-haiku-4-5' } = options;

  if (messages.length === 0) return messages;

  // Phase 1: prune tool outputs (aggressive only)
  const pruned = mode === 'aggressive' ? pruneToolOutputs(messages) : messages;

  // Phase 2-3: separate protected tail from candidate middle
  const { protected_, candidates } = protectMessages(pruned);

  if (candidates.length === 0) return protected_;

  // Phase 4: LLM-structured summary of candidates
  const summary = await summarizeWithLLM(candidates, model);

  // Phase 5: assemble final context
  return updateContext(protected_, summary, candidates);
}

export type { CompactionResult, SessionSummary } from './types.js';
