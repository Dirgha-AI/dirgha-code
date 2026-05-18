import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
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
import { Box, Text, useStdout } from "ink";
import { useTranscriptScroll } from "../use-transcript-scroll.js";
export const VirtualTranscript = React.memo(function VirtualTranscript(props) {
    const { items, renderItem, autoScroll, inputFocus } = props;
    const { stdout } = useStdout();
    const rows = stdout?.rows ?? 24;
    // Reserve rows for prompt + status lines below the transcript.
    const buffer = 5;
    const visibleCount = Math.max(1, rows - buffer);
    const { pinnedEndIdx, isAtBottom, belowCount } = useTranscriptScroll(items.length, visibleCount, autoScroll, inputFocus);
    // Slice the viewport: show `visibleCount` items ending at `pinnedEndIdx`,
    // with an extra `buffer` items above for smooth scroll-out.
    const endIdx = pinnedEndIdx;
    const visibleStart = Math.max(0, endIdx - visibleCount);
    const paddedStart = Math.max(0, visibleStart - buffer);
    const visibleItems = items.slice(paddedStart, endIdx);
    const aboveCount = paddedStart;
    return (_jsxs(Box, { flexDirection: "column", children: [aboveCount > 0 && (_jsx(Box, { children: _jsxs(Text, { dimColor: true, children: ["[", aboveCount, " item", aboveCount !== 1 ? "s" : "", " above]"] }) })), visibleItems.map((item) => (_jsx(React.Fragment, { children: renderItem(item) }, item.id))), belowCount > 0 && (_jsx(Box, { children: _jsxs(Text, { dimColor: true, children: ["[", belowCount, " item", belowCount !== 1 ? "s" : "", " below \u00B7 PageDown]"] }) })), !isAtBottom && (_jsx(Box, { children: _jsxs(Text, { dimColor: true, children: ["[at item ", pinnedEndIdx, "/", items.length, " \u00B7 End to follow]"] }) }))] }));
});
//# sourceMappingURL=VirtualTranscript.js.map