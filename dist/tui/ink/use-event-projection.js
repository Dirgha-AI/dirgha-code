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
import * as React from "react";
import { randomUUID } from "node:crypto";
export function useEventProjection(events) {
    const [liveItems, setLiveItems] = React.useState([]);
    const [totals, setTotals] = React.useState({
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
    });
    // Accumulate text deltas in a ref and flush to state on a timer to
    // avoid re-parsing full markdown on every single delta (O(n²) parse
    // cost causes visible lag at the end of long streaming responses).
    const pendingTextRef = React.useRef(null);
    const flushTimerRef = React.useRef(null);
    React.useEffect(() => {
        // Local ids used to attribute in-flight deltas to the right span.
        let currentTextId = null;
        let currentThinkingId = null;
        const unsubscribe = events.subscribe((event) => {
            switch (event.type) {
                case "text_start":
                    currentTextId = randomUUID();
                    currentThinkingId = null;
                    setLiveItems((prev) => [
                        ...prev,
                        { kind: "text", id: currentTextId, content: "" },
                    ]);
                    return;
                case "text_delta": {
                    const id = currentTextId;
                    if (!id)
                        return;
                    pendingTextRef.current = {
                        id,
                        content: (pendingTextRef.current?.content ?? "") + event.delta,
                    };
                    if (!flushTimerRef.current) {
                        flushTimerRef.current = setTimeout(() => {
                            const p = pendingTextRef.current;
                            pendingTextRef.current = null;
                            flushTimerRef.current = null;
                            if (!p)
                                return;
                            setLiveItems((prev) => prev.map((it) => it.kind === "text" && it.id === p.id
                                ? { ...it, content: p.content }
                                : it));
                        }, 50);
                    }
                    return;
                }
                case "text_end":
                    currentTextId = null;
                    return;
                case "thinking_start":
                    currentThinkingId = randomUUID();
                    setLiveItems((prev) => [
                        ...prev,
                        { kind: "thinking", id: currentThinkingId, content: "" },
                    ]);
                    return;
                case "thinking_delta": {
                    const id = currentThinkingId;
                    if (!id)
                        return;
                    setLiveItems((prev) => prev.map((it) => it.kind === "thinking" && it.id === id
                        ? { ...it, content: it.content + event.delta }
                        : it));
                    return;
                }
                case "thinking_end":
                    currentThinkingId = null;
                    return;
                case "toolcall_start": {
                    const item = {
                        kind: "tool",
                        id: event.id,
                        name: event.name,
                        status: "pending",
                        argSummary: "generating...",
                        outputPreview: "",
                        startedAt: Date.now(),
                    };
                    setLiveItems((prev) => [...prev, item]);
                    return;
                }
                case "toolcall_end":
                    // Remove the pending "generating..." placeholder when the
                    // tool call JSON is fully received. tool_exec_start follows
                    // with the real item.
                    setLiveItems((prev) => prev.filter((it) => !(it.kind === "tool" &&
                        it.id === event.id &&
                        it.status === "pending")));
                    return;
                case "tool_exec_start": {
                    const item = {
                        kind: "tool",
                        id: event.id,
                        name: event.name,
                        status: "running",
                        argSummary: summariseInput(event.input),
                        outputPreview: "",
                        startedAt: Date.now(),
                    };
                    setLiveItems((prev) => [...prev, item]);
                    return;
                }
                case "tool_exec_end": {
                    const status = event.isError ? "error" : "done";
                    setLiveItems((prev) => prev.map((it) => it.kind === "tool" && it.id === event.id
                        ? {
                            ...it,
                            status,
                            outputPreview: event.output.slice(0, 200),
                            durationMs: event.durationMs,
                        }
                        : it));
                    return;
                }
                case "usage":
                    setTotals((prev) => ({
                        inputTokens: prev.inputTokens + event.inputTokens,
                        outputTokens: prev.outputTokens + event.outputTokens,
                        cachedTokens: prev.cachedTokens + (event.cachedTokens ?? 0),
                        costUsd: prev.costUsd,
                    }));
                    return;
                case "error":
                    setLiveItems((prev) => [
                        ...prev,
                        {
                            kind: "error",
                            id: randomUUID(),
                            message: event.message,
                            ...(event.failoverModel !== undefined
                                ? { failoverModel: event.failoverModel }
                                : {}),
                        },
                    ]);
                    return;
                case "turn_end":
                    currentTextId = null;
                    currentThinkingId = null;
                    return;
                default:
                    return;
            }
        });
        return unsubscribe;
    }, [events]);
    const commitLive = React.useCallback(() => {
        let committed = [];
        setLiveItems((prev) => {
            committed = prev;
            return [];
        });
        return committed;
    }, []);
    const appendLive = React.useCallback((item) => {
        setLiveItems((prev) => [...prev, item]);
    }, []);
    const clear = React.useCallback(() => {
        setLiveItems([]);
        setTotals({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
    }, []);
    return { liveItems, totals, commitLive, appendLive, clear };
}
function summariseInput(input, max = 60) {
    if (input === undefined || input === null)
        return "";
    const s = typeof input === "string" ? input : safeStringify(input);
    const collapsed = s.replace(/\s+/g, " ").trim();
    return collapsed.length <= max
        ? collapsed
        : `${collapsed.slice(0, max - 1)}…`;
}
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=use-event-projection.js.map