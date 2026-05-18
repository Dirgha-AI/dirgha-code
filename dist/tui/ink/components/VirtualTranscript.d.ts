/**
 * Virtualised transcript list — always-on viewport slicing.
 *
 * Renders only the items within the visible terminal viewport plus a
 * 5-item buffer above and below. Uses pinned-absolute-index scrolling
 * so the viewport never shifts when new items arrive mid-scroll.
 *
 * When items exist below the viewport, a `[N items below · ↓ see]`
 * indicator is shown. When items exist above, a `[N items above]`
 * indicator is shown.
 */
import * as React from "react";
import type { TranscriptItem } from "../use-event-projection.js";
export interface VirtualTranscriptProps {
    items: TranscriptItem[];
    renderItem: (item: TranscriptItem) => React.ReactNode;
    autoScroll: boolean;
    inputFocus: boolean;
}
export declare const VirtualTranscript: React.NamedExoticComponent<VirtualTranscriptProps>;
