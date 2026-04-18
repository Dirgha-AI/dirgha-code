/**
 * agent/memory-sync.ts — Post-loop memory synchronization
 */
import type { Message, ContentBlock } from '../types.js';
import { getMemoryManager } from '../memory/manager.js';

export async function syncMemoryAfterLoop(history: Message[], userInput: string): Promise<void> {
  try {
    const memMgr = getMemoryManager();
    const lastAssistant = history.filter(m => m.role === 'assistant').pop();
    const textResponse = Array.isArray(lastAssistant?.content)
      ? (lastAssistant.content as ContentBlock[])
          .filter(b => b.type === 'text')
          .map(b => b.text ?? '')
          .join('\n')
      : String(lastAssistant?.content ?? '');
    if (textResponse) await memMgr.syncAll(userInput, textResponse);
  } catch { /* memory sync is best-effort */ }
}
