/**
 * Context compaction.
 *
 * When the total token estimate of the running history crosses a
 * threshold, summarise the older portion via a provider call and return
 * a trimmed history that contains the system prompt, a synthetic user
 * summary, and the last N preserved turns. A compaction log entry is
 * written to the session so the operation is auditable.
 */
import type { Provider, Message } from "../kernel/types.js";
import type { Session } from "./session.js";
import type { HookRegistry } from "../hooks/registry.js";
export interface CompactionConfig {
    triggerTokens: number;
    preserveLastTurns: number;
    summarizer: Provider;
    summaryModel: string;
    maxSummaryTokens?: number;
    /** Optional hook registry; if present, fires compaction_before/_after. */
    hooks?: HookRegistry;
}
export interface CompactionResult {
    messages: Message[];
    compacted: boolean;
    summary?: string;
    tokensBefore: number;
    tokensAfter: number;
}
export declare function maybeCompact(messages: Message[], cfg: CompactionConfig, session?: Session): Promise<CompactionResult>;
/**
 * Build a `contextTransform` callback suitable for `runAgentLoop`'s
 * config. Each turn, the transform measures the running history and —
 * when its token estimate crosses 75% of the model's context window —
 * runs maybeCompact to summarise older turns and replace them with a
 * single synthetic user message. The compacted history is then
 * persisted back into the caller's `history` mutable ref so subsequent
 * turns build on the trimmed view, not the original.
 */
export declare function createCompactionTransform(opts: {
    contextWindow: number;
    preserveLastTurns?: number;
    summarizer: Provider;
    summaryModel: string;
    session?: Session;
    hooks?: HookRegistry;
    history: Message[];
    onCompact?: (result: CompactionResult) => void;
}): (messages: Message[]) => Promise<Message[]>;
