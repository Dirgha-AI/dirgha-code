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

export class ConversationProjection {
  private _messages: Array<{ ts: string; message: Message }> = [];
  private _title: string | null = null;
  private _usage: UsageTotal = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
  private _compactionThreshold: string | null = null;
  private _entries: SessionEntry[] = [];

  /** Apply a single SessionEntry to this projection. */
  apply(entry: SessionEntry): void {
    this._entries.push(entry);
    switch (entry.type) {
      case 'message':
        this._messages.push({ ts: entry.ts, message: entry.message });
        break;
      case 'compaction':
        this._compactionThreshold = entry.keptFrom;
        break;
      case 'title':
        this._title = entry.title;
        break;
      case 'usage':
        this._usage = {
          inputTokens: this._usage.inputTokens + (entry.usage.inputTokens ?? 0),
          outputTokens: this._usage.outputTokens + (entry.usage.outputTokens ?? 0),
          cachedTokens: this._usage.cachedTokens + (entry.usage.cachedTokens ?? 0),
          costUsd: this._usage.costUsd + (entry.usage.costUsd ?? 0),
        };
        break;
      // model_change / branch / system are recorded in _entries but
      // don't update other projection state.
      default:
        break;
    }
  }

  /** Bulk-load from an async iterable of entries (e.g. session.replay()). */
  async replayFrom(entries: AsyncIterable<SessionEntry>): Promise<void> {
    for await (const e of entries) {
      this.apply(e);
    }
  }

  /** Get all visible messages — those with ts >= compactionThreshold. */
  getMessages(): Message[] {
    const t = this._compactionThreshold;
    return this._messages
      .filter((m) => !t || m.ts >= t)
      .map((m) => m.message);
  }

  getTitle(): string | null {
    return this._title;
  }

  getUsage(): UsageTotal {
    return { ...this._usage };
  }

  getCompactionThreshold(): string | null {
    return this._compactionThreshold;
  }

  /** Read-only view of the raw entry stream we've ingested. */
  getEntries(): SessionEntry[] {
    return this._entries.slice();
  }

  /** Total message count including pre-compaction entries (audit/debug). */
  rawMessageCount(): number {
    return this._messages.length;
  }

  /** Visible message count (post-compaction filter). */
  visibleMessageCount(): number {
    return this.getMessages().length;
  }
}
