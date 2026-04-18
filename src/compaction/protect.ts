/**
 * compaction/protect.ts — Phase 2-3: Protect system + recent messages
 */
import type { Message } from '../types.js';

const PROTECT_WINDOW = 10; // Keep last N messages

export function protectMessages(messages: Message[]): { protected_: Message[]; candidates: Message[] } {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  
  const protected_ = [...systemMsgs];
  const candidates: Message[] = [];
  
  if (nonSystem.length <= PROTECT_WINDOW) {
    return { protected_: messages, candidates: [] };
  }
  
  // Protect last N messages
  protected_.push(...nonSystem.slice(-PROTECT_WINDOW));
  candidates.push(...nonSystem.slice(0, -PROTECT_WINDOW));
  
  return { protected_, candidates };
}
