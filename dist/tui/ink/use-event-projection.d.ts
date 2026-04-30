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
import type { UsageTotal } from '../../kernel/types.js';
import type { EventStream } from '../../kernel/event-stream.js';
import type { ToolStatus } from './components/ToolBox.js';
export type TranscriptItem = {
    kind: 'user';
    id: string;
    text: string;
} | {
    kind: 'text';
    id: string;
    content: string;
} | {
    kind: 'thinking';
    id: string;
    content: string;
} | {
    kind: 'tool';
    id: string;
    name: string;
    status: ToolStatus;
    argSummary: string;
    outputPreview: string;
    startedAt: number;
    durationMs?: number;
} | {
    kind: 'error';
    id: string;
    message: string;
} | {
    kind: 'notice';
    id: string;
    text: string;
};
export interface EventProjection {
    liveItems: TranscriptItem[];
    totals: UsageTotal;
    commitLive: () => TranscriptItem[];
    appendLive: (item: TranscriptItem) => void;
    clear: () => void;
}
export declare function useEventProjection(events: EventStream): EventProjection;
