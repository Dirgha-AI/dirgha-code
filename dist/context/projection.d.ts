/**
 * ConversationProjection: a derived, in-memory view of session state.
 *
 * The class accepts SessionEntry events (the same shape that
 * SessionStore writes to JSONL) and maintains:
 *   - messages: the current Message[] derived from message entries,
 *     filtered by the latest compaction threshold
 *   - title: the session title (set by the last 'title' entry)
 *   - usage: cumulative UsageTotal
 *   - compactionThreshold: the keptFrom ts of the latest compaction
 *
 * Two usage patterns:
 *   - Replay-based: pass an async iterable of entries to .replayFrom()
 *     to bulk-load state from a session JSONL
 *   - Live: call .apply(entry) once per new entry to keep the
 *     projection in sync with appends
 *
 * This class is read-only from the outside: consumers can only get
 * the current snapshot via getMessages() / getTitle() / getUsage() /
 * getEntries(). The projection itself does NOT write to disk; that
 * remains the Session's responsibility.
 *
 * Not currently used by the agent loop (which keeps its own
 * history array). Provided here so the TUI surface, daemon, and
 * future web-IDE clients can render session state without
 * re-implementing replay logic.
 */
import type { Message, UsageTotal } from '../kernel/types.js';
import type { SessionEntry } from './session.js';
export declare class ConversationProjection {
    private _messages;
    private _title;
    private _usage;
    private _compactionThreshold;
    private _entries;
    /** Apply a single SessionEntry to this projection. */
    apply(entry: SessionEntry): void;
    /** Bulk-load from an async iterable of entries (e.g. session.replay()). */
    replayFrom(entries: AsyncIterable<SessionEntry>): Promise<void>;
    /** Get all visible messages — those with ts >= compactionThreshold. */
    getMessages(): Message[];
    getTitle(): string | null;
    getUsage(): UsageTotal;
    getCompactionThreshold(): string | null;
    /** Read-only view of the raw entry stream we've ingested. */
    getEntries(): SessionEntry[];
    /** Total message count including pre-compaction entries (audit/debug). */
    rawMessageCount(): number;
    /** Visible message count (post-compaction filter). */
    visibleMessageCount(): number;
}
