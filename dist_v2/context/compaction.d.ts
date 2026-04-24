/**
 * Context compaction.
 *
 * When the total token estimate of the running history crosses a
 * threshold, summarise the older portion via a provider call and return
 * a trimmed history that contains the system prompt, a synthetic user
 * summary, and the last N preserved turns. A compaction log entry is
 * written to the session so the operation is auditable.
 */
import type { Provider, Message } from '../kernel/types.js';
import type { Session } from './session.js';
export interface CompactionConfig {
    triggerTokens: number;
    preserveLastTurns: number;
    summarizer: Provider;
    summaryModel: string;
    maxSummaryTokens?: number;
}
export interface CompactionResult {
    messages: Message[];
    compacted: boolean;
    summary?: string;
    tokensBefore: number;
    tokensAfter: number;
}
export declare function maybeCompact(messages: Message[], cfg: CompactionConfig, session?: Session): Promise<CompactionResult>;
