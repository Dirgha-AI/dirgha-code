/**
 * Virtualised transcript list for long sessions.
 *
 * Renders only the items within the visible terminal viewport plus a
 * 5-item buffer above and below.  Item count is used as a rough proxy
 * for lines — the goal is to keep the in-memory render tree small
 * rather than achieving pixel-perfect viewport clipping.
 *
 * When scrolled above the bottom, a `[N items above]` spacer is shown.
 */
import * as React from "react";
import type { TranscriptItem } from "../use-event-projection.js";
export interface VirtualTranscriptProps {
    items: TranscriptItem[];
    renderItem: (item: TranscriptItem) => React.ReactNode;
    autoScroll: boolean;
    inputFocus: boolean;
}
export declare function VirtualTranscript(props: VirtualTranscriptProps): React.JSX.Element;
