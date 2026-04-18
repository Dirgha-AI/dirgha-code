/**
 * compaction/types.ts — Context compaction types
 */
export interface SessionSummary {
  goal: string;
  progress: string[];
  decisions: Array<{ what: string; why: string }>;
  files: Array<{ path: string; status: 'created' | 'modified' | 'deleted' }>;
  nextSteps: string[];
  tokenCount: number;
  version: number;
  timestamp: string;
}

export interface CompactionResult {
  beforeTokens: number;
  afterTokens: number;
  saved: number;
  summary: SessionSummary;
  messagesKept: number;
  messagesRemoved: number;
}
