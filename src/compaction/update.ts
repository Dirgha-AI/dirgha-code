/**
 * compaction/update.ts — Phase 5: Iterative update
 */
import type { Message } from '../types.js';
import type { SessionSummary } from './types.js';

export function updateContext(
  protected_: Message[],
  summary: SessionSummary,
  candidates: Message[]
): Message[] {
  const summaryMsg: Message = {
    role: 'system',
    content: formatSummary(summary)
  };
  
  return [summaryMsg, ...protected_];
}

function formatSummary(s: SessionSummary): string {
  return [
    `[Session Summary v${s.version}]`,
    `Goal: ${s.goal}`,
    `Progress: ${s.progress.join(', ')}`,
    s.decisions.length ? `Decisions: ${s.decisions.map(d => d.what).join('; ')}` : '',
    s.files.length ? `Files: ${s.files.map(f => f.path).join(', ')}` : '',
    `Next: ${s.nextSteps.join(', ')}`
  ].filter(Boolean).join('\n');
}
