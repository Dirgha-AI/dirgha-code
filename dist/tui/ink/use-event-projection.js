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
    const lastFlushedTextRef = React.useRef("");
    const flushTimerRef = React.useRef(null);
    const pendingThinkingRef = React.useRef(null);
    const lastFlushedThinkingRef = React.useRef("");
    const flushThinkingTimerRef = React.useRef(null);
    // Per-tool-id buffers for tool_exec_progress — same debounce pattern as text_delta.
    const pendingProgressRef = React.useRef(new Map());
    const progressTimerRef = React.useRef(new Map());
    // Mirror of liveItems kept in a ref so commitLive can read the latest
    // value synchronously from an async context without relying on the
    // functional-updater side-channel pattern (which only runs synchronously
    // from React event handlers, not from async finally blocks).
    const liveItemsRef = React.useRef([]);
    // Adaptive flush: longer text → slower flush to keep rendering smooth.
    // Short responses stay snappy; long responses avoid the 20Hz jitter trap.
    function flushDelay(totalChars) {
        if (totalChars < 500)
            return 30;
        if (totalChars < 2000)
            return 80;
        return 150;
    }
    const setLive = React.useCallback((updater) => {
        setLiveItems((prev) => {
            const next = typeof updater === "function" ? updater(prev) : updater;
            liveItemsRef.current = next;
            return next;
        });
    }, []);
    React.useEffect(() => {
        // Local ids used to attribute in-flight deltas to the right span.
        let currentTextId = null;
        let currentThinkingId = null;
        function flushPending() {
            const p = pendingTextRef.current;
            if (!p)
                return;
            pendingTextRef.current = null;
            lastFlushedTextRef.current = "";
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            setLive((prev) => Array.isArray(prev)
                ? prev.map((it) => it.kind === "text" && it.id === p.id
                    ? { ...it, content: p.content }
                    : it)
                : prev);
        }
        function flushPendingThinking() {
            const p = pendingThinkingRef.current;
            if (!p)
                return;
            pendingThinkingRef.current = null;
            lastFlushedThinkingRef.current = "";
            if (flushThinkingTimerRef.current !== null) {
                clearTimeout(flushThinkingTimerRef.current);
                flushThinkingTimerRef.current = null;
            }
            setLive((prev) => Array.isArray(prev)
                ? prev.map((it) => it.kind === "thinking" && it.id === p.id
                    ? { ...it, content: p.content }
                    : it)
                : prev);
        }
        const toolcallArgBuffers = new Map();
        const unsubscribe = events.subscribe((event) => {
            switch (event.type) {
                case "agent_start":
                    // Clear stale live items from any aborted prior session so they
                    // don't bleed into the next turn's display.
                    lastFlushedTextRef.current = "";
                    lastFlushedThinkingRef.current = "";
                    setLive([]);
                    return;
                case "text_start":
                    currentTextId = randomUUID();
                    currentThinkingId = null;
                    setLive((prev) => [
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
                            flushTimerRef.current = null;
                            const p = pendingTextRef.current;
                            if (!p)
                                return;
                            if (p.content === lastFlushedTextRef.current)
                                return;
                            lastFlushedTextRef.current = p.content;
                            setLive((prev) => Array.isArray(prev)
                                ? prev.map((it) => it.kind === "text" && it.id === p.id
                                    ? { ...it, content: p.content }
                                    : it)
                                : prev);
                        }, flushDelay(pendingTextRef.current?.content.length ?? 0));
                    }
                    return;
                }
                case "text_end":
                    flushPending();
                    currentTextId = null;
                    return;
                case "thinking_start":
                    currentThinkingId = randomUUID();
                    setLive((prev) => [
                        ...prev,
                        { kind: "thinking", id: currentThinkingId, content: "" },
                    ]);
                    return;
                case "thinking_delta": {
                    const id = currentThinkingId;
                    if (!id)
                        return;
                    pendingThinkingRef.current = {
                        id,
                        content: (pendingThinkingRef.current?.content ?? "") + event.delta,
                    };
                    if (!flushThinkingTimerRef.current) {
                        flushThinkingTimerRef.current = setTimeout(() => {
                            flushThinkingTimerRef.current = null;
                            const p = pendingThinkingRef.current;
                            if (!p)
                                return;
                            if (p.content === lastFlushedThinkingRef.current)
                                return;
                            lastFlushedThinkingRef.current = p.content;
                            setLive((prev) => Array.isArray(prev)
                                ? prev.map((it) => it.kind === "thinking" && it.id === p.id
                                    ? { ...it, content: p.content }
                                    : it)
                                : prev);
                        }, flushDelay(pendingThinkingRef.current?.content.length ?? 0));
                    }
                    return;
                }
                case "thinking_end":
                    flushPendingThinking();
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
                    setLive((prev) => [...prev, item]);
                    return;
                }
                case "toolcall_delta": {
                    // Buffer argJson in the item in-place without triggering a render.
                    // The pending "generating..." placeholder shows nothing meaningful
                    // until toolcall_end removes it; intermediate argJson updates
                    // produce zero visible change and only cause render thrashing.
                    // We still need to accumulate so toolcall_end can build a summary
                    // if needed — store in a local map keyed by event.id.
                    if (!toolcallArgBuffers.has(event.id))
                        toolcallArgBuffers.set(event.id, "");
                    toolcallArgBuffers.set(event.id, (toolcallArgBuffers.get(event.id) ?? "") + event.deltaJson);
                    return;
                }
                case "toolcall_end":
                    // Remove the pending "generating..." placeholder when the
                    // tool call JSON is fully received. tool_exec_start follows
                    // with the real item.
                    toolcallArgBuffers.delete(event.id);
                    setLive((prev) => prev.filter((it) => !(it.kind === "tool" &&
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
                    setLive((prev) => [...prev, item]);
                    return;
                }
                case "tool_exec_progress": {
                    const toolId = event.id;
                    pendingProgressRef.current.set(toolId, (pendingProgressRef.current.get(toolId) ?? "") +
                        event.message +
                        "\n");
                    if (!progressTimerRef.current.has(toolId)) {
                        progressTimerRef.current.set(toolId, setTimeout(() => {
                            progressTimerRef.current.delete(toolId);
                            const accumulated = pendingProgressRef.current.get(toolId);
                            if (!accumulated)
                                return;
                            setLive((prev) => prev.map((it) => it.kind === "tool" &&
                                it.id === toolId &&
                                it.status === "running"
                                ? { ...it, outputPreview: accumulated }
                                : it));
                        }, 50));
                    }
                    return;
                }
                case "tool_exec_end": {
                    // Flush any buffered progress before the final state overwrites it.
                    const pending = progressTimerRef.current.get(event.id);
                    if (pending !== undefined) {
                        clearTimeout(pending);
                        progressTimerRef.current.delete(event.id);
                    }
                    pendingProgressRef.current.delete(event.id);
                    const status = event.isError ? "error" : "done";
                    const diff = typeof event.metadata?.diff === "string"
                        ? event.metadata.diff
                        : undefined;
                    const outputKind = diff !== undefined
                        ? "diff"
                        : hasDiffMarkers(event.output)
                            ? "diff"
                            : "text";
                    const outputText = outputKind === "diff" && diff !== undefined ? diff : event.output;
                    setLive((prev) => prev.map((it) => it.kind === "tool" && it.id === event.id
                        ? {
                            ...it,
                            status,
                            outputPreview: outputText.slice(0, 2000),
                            outputKind,
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
                    setLive((prev) => [
                        ...prev,
                        {
                            kind: "error",
                            id: randomUUID(),
                            message: event.message,
                            ...(event.failoverModel !== undefined
                                ? { failoverModel: event.failoverModel }
                                : {}),
                            ...(event.userMessage !== undefined
                                ? { userMessage: event.userMessage }
                                : {}),
                        },
                    ]);
                    return;
                case "turn_end":
                    flushPending();
                    flushPendingThinking();
                    currentTextId = null;
                    currentThinkingId = null;
                    return;
                default:
                    return;
            }
        });
        return () => {
            unsubscribe();
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            if (flushThinkingTimerRef.current !== null) {
                clearTimeout(flushThinkingTimerRef.current);
                flushThinkingTimerRef.current = null;
            }
            for (const t of progressTimerRef.current.values())
                clearTimeout(t);
            progressTimerRef.current.clear();
            pendingProgressRef.current.clear();
        };
    }, [events, setLive]);
    const commitLive = React.useCallback(() => {
        // Cancel any pending flush timers so they don't fire against the
        // cleared state after commit (race: fast provider, timer still pending).
        if (flushTimerRef.current !== null) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        if (flushThinkingTimerRef.current !== null) {
            clearTimeout(flushThinkingTimerRef.current);
            flushThinkingTimerRef.current = null;
        }
        // Flush any accumulated-but-not-yet-flushed text into liveItemsRef.
        const pt = pendingTextRef.current;
        if (pt) {
            pendingTextRef.current = null;
            liveItemsRef.current = liveItemsRef.current.map((it) => it.kind === "text" && it.id === pt.id
                ? { ...it, content: pt.content }
                : it);
        }
        const pk = pendingThinkingRef.current;
        if (pk) {
            pendingThinkingRef.current = null;
            liveItemsRef.current = liveItemsRef.current.map((it) => it.kind === "thinking" && it.id === pk.id
                ? { ...it, content: pk.content }
                : it);
        }
        // Read the ref synchronously — safe from async finally blocks.
        const committed = liveItemsRef.current;
        liveItemsRef.current = [];
        setLiveItems([]);
        return committed;
    }, []);
    const appendLive = React.useCallback((item) => {
        setLive((prev) => [...prev, item]);
    }, [setLive]);
    const clear = React.useCallback(() => {
        liveItemsRef.current = [];
        lastFlushedTextRef.current = "";
        lastFlushedThinkingRef.current = "";
        setLiveItems([]);
        setTotals({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
    }, []);
    return React.useMemo(() => ({ liveItems, totals, commitLive, appendLive, clear }), [liveItems, totals, commitLive, appendLive, clear]);
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
function hasDiffMarkers(result) {
    return /^[+-]|^@@\s/m.test(result);
}
//# sourceMappingURL=use-event-projection.js.map