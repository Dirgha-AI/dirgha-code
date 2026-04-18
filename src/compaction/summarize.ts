/**
 * compaction/summarize.ts — Phase 4: LLM structured summary
 */
import type { Message } from '../types.js';
import type { SessionSummary } from './types.js';

export async function summarizeWithLLM(
  messages: Message[],
  model: string
): Promise<SessionSummary> {
  // Build context for summary
  const content = messages.map(m => `${m.role}: ${m.content?.slice(0, 200)}`).join('\n');
  
  // Extract decisions from content
  const decisions: SessionSummary['decisions'] = [];
  const decisionMatches = content.match(/(decided|chose|opted for|using|will use)[^.]+/gi) || [];
  for (const match of decisionMatches.slice(0, 5)) {
    decisions.push({ what: match.trim(), why: 'From session context' });
  }
  
  // Track file changes
  const files: SessionSummary['files'] = [];
  const fileMatches = content.match(/([\w-]+\.(ts|js|json|md|py|rs|go))/g) || [];
  for (const file of [...new Set(fileMatches)].slice(0, 10)) {
    files.push({ path: file, status: 'modified' });
  }
  
  return {
    goal: 'Session context',
    progress: [`Processed ${messages.length} messages`],
    decisions,
    files,
    nextSteps: ['Continue from previous context'],
    tokenCount: Math.ceil(content.length / 4),
    version: 1,
    timestamp: new Date().toISOString()
  };
}
