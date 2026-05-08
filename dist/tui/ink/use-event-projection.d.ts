/**
 * useEventProjection: subscribes to the kernel EventStream and projects
 * raw AgentEvents into the transcript records that App renders.
 *
 * Split out of App.tsx so the root component stays focused on layout.
 * The projection rule set mirrors the v1 renderer: contiguous text
 * deltas fold into a single TextSpan; thinking deltas into a
 * ThinkingSpan; each tool invocation produces a ToolRecord that
 * starts in 'running' and flips to 'done' or 'error' on exec_end.
 */
import type { UsageTotal } from "../../kernel/types.js";
import type { EventStream } from "../../kernel/event-stream.js";
import type { ToolStatus } from "./components/ToolBox.js";
export type TranscriptItem = {
    kind: "user";
    id: string;
    text: string;
} | {
    kind: "text";
    id: string;
    content: string;
} | {
    kind: "thinking";
    id: string;
    content: string;
} | {
    kind: "tool";
    id: string;
    name: string;
    status: ToolStatus;
    argSummary: string;
    argJson?: string;
    outputPreview: string;
    outputKind?: "text" | "diff";
    startedAt: number;
    durationMs?: number;
} | {
    kind: "error";
    id: string;
    message: string;
    failoverModel?: string;
    userMessage?: string;
} | {
    kind: "notice";
    id: string;
    text: string;
};
export interface EventProjection {
    liveItems: TranscriptItem[];
    totals: UsageTotal;
    commitLive: () => TranscriptItem[];
    appendLive: (item: TranscriptItem) => void;
    /** Synchronously updates liveItemsRef so commitLive() sees the item. */
    appendLiveSync: (item: TranscriptItem) => void;
    clear: () => void;
}
export interface EventProjectionOptions {
    /** Called when the streamed text exceeds MAX_LIVE_CHUNK_CHARS and is
     *  split at a safe markdown boundary. The older portion is committed
     *  to static history; the caller should append it to the transcript. */
    onCommitSplit?: (item: TranscriptItem) => void;
    /** Returns true while the next agent_start should be treated as the
     *  first response of the session — the projection scans the first
     *  text_delta line for `[session-title] <summary>` and, if found,
     *  strips it from display and reports via onSessionTitle. */
    isFirstTurn?: () => boolean;
    /** Called once when the marker is detected. Caller updates the OSC
     *  terminal title + persists to the session JSONL. */
    onSessionTitle?: (title: string) => void;
}
export declare function useEventProjection(events: EventStream, opts?: EventProjectionOptions): EventProjection;
