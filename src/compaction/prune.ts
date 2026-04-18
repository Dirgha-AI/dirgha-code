/**
 * compaction/prune.ts — Phase 1: Prune old tool outputs
 */
import type { Message } from '../types.js';

export function pruneToolOutputs(messages: Message[]): Message[] {
  const pruned: Message[] = [];
  let lastToolOutput = -1;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    if (msg.role === 'tool') {
      lastToolOutput = i;
    } else if (msg.role === 'assistant' && lastToolOutput === i + 1) {
      // Keep assistant msg that triggered tool, but mark for summary
      pruned.unshift({ ...msg, tool_calls: undefined });
    } else {
      pruned.unshift(msg);
    }
  }
  
  return pruned;
}
