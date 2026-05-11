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
import type { AgentEvent, UsageTotal } from "../../kernel/types.js";
import type { EventStream } from "../../kernel/event-stream.js";
import type { ToolStatus } from "./components/ToolBox.js";
import {
  findLastSafeSplitPoint,
  MAX_LIVE_CHUNK_CHARS,
} from "./markdown/split-point.js";
import { minFlushMs } from "./is-small-terminal.js";

export type TranscriptItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "text"; id: string; content: string }
  | { kind: "thinking"; id: string; content: string }
  | {
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
    }
  | {
      kind: "error";
      id: string;
      message: string;
      failoverModel?: string;
      userMessage?: string;
    }
  | { kind: "notice"; id: string; text: string };

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
  /** Adaptive backpressure ref — when provided, flushDelay uses
   *  `adaptiveFlushRef.current.floorMs` as the flush floor instead of
   *  the static `minFlushMs()` value. App.tsx updates this based on
   *  observed render frame times so slow frames automatically back off. */
  adaptiveFlushRef?: React.RefObject<{ floorMs: number }>;
}

/**
 * Marker the model is asked to emit on the first line of its first
 * response. See `sessionTitleInstruction()` in src/context/primer.ts.
 * Match is anchored to the start of accumulated text — only the very
 * first character of the very first response can match.
 */
const SESSION_TITLE_MARKER_RX = /^\[session-title\]\s*([^\n]+)\n+/;

export function useEventProjection(
  events: EventStream,
  opts: EventProjectionOptions = {},
): EventProjection {
  const [liveItems, setLiveItems] = React.useState<TranscriptItem[]>([]);
  const [totals, setTotals] = React.useState<UsageTotal>({
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costUsd: 0,
  });
  // Accumulate text deltas in a ref and flush to state on a timer to
  // avoid re-parsing full markdown on every single delta (O(n²) parse
  // cost causes visible lag at the end of long streaming responses).
  const pendingTextRef = React.useRef<{ id: string; content: string } | null>(
    null,
  );
  const lastFlushedTextRef = React.useRef<string>("");
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingThinkingRef = React.useRef<{
    id: string;
    content: string;
  } | null>(null);
  const lastFlushedThinkingRef = React.useRef<string>("");
  const flushThinkingTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  // Per-tool-id buffers for tool_exec_progress — same debounce pattern as text_delta.
  const pendingProgressRef = React.useRef<Map<string, string>>(new Map());
  const progressTimerRef = React.useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  // Mirror of liveItems kept in a ref so commitLive can read the latest
  // value synchronously from an async context without relying on the
  // functional-updater side-channel pattern (which only runs synchronously
  // from React event handlers, not from async finally blocks).
  const liveItemsRef = React.useRef<TranscriptItem[]>([]);

  // Per-turn state for the `[session-title]` marker scan.
  //   "scanning" — set on text_start when isFirstTurn() returned true.
  //                The flush path withholds the live update until either
  //                a newline arrives (so we can match the regex) or the
  //                accumulated content is clearly not the marker (then
  //                we fall through to a normal flush and never look
  //                again). Always transitions to "done" once decided.
  //   "done"     — no more scanning for this turn or session.
  const titleScanRef = React.useRef<"scanning" | "done">("done");

  // Adaptive flush: longer text → slower flush to keep rendering smooth.
  // Short responses stay snappy; long responses avoid terminal flicker.
  // The floor is either the static minFlushMs() or the adaptive backpressure
  // floor from opts.adaptiveFlushRef (updated by App.tsx based on render
  // frame timing). Minimum 80ms (12.5 FPS) on desktop, 200ms on mobile.
  function flushDelay(totalChars: number): number {
    const floor = opts.adaptiveFlushRef?.current.floorMs ?? minFlushMs();
    if (totalChars < 500) return floor;
    if (totalChars < 2000) return Math.max(120, floor);
    return Math.max(200, floor);
  }

  const setLive = React.useCallback(
    (
      updater:
        | TranscriptItem[]
        | ((prev: TranscriptItem[]) => TranscriptItem[]),
    ) => {
      setLiveItems((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        liveItemsRef.current = next;
        return next;
      });
    },
    [],
  );

  // Tool lifecycle microtask queue — batches toolcall_start/end and
  // tool_exec_start/end updaters so clustered tool events produce one
  // Ink repaint instead of 3-4 separate ones. Text/thinking deltas are
  // NOT batched here (they have their own setTimeout debounce). Approval
  // state is also NOT batched (must appear immediately).
  const pendingToolUpdatesRef = React.useRef<
    Array<(prev: TranscriptItem[]) => TranscriptItem[]>
  >([]);
  const toolFlushScheduledRef = React.useRef(false);

  const scheduleToolFlush = React.useCallback(() => {
    if (toolFlushScheduledRef.current) return;
    toolFlushScheduledRef.current = true;
    queueMicrotask(() => {
      toolFlushScheduledRef.current = false;
      const updates = pendingToolUpdatesRef.current.splice(0);
      if (updates.length === 0) return;
      setLive((prev) => updates.reduce((acc, fn) => fn(acc), prev));
    });
  }, [setLive]);

  React.useEffect(() => {
    // Local ids used to attribute in-flight deltas to the right span.
    let currentTextId: string | null = null;
    let currentThinkingId: string | null = null;

    function flushPending(): void {
      const p = pendingTextRef.current;
      if (!p) return;
      pendingTextRef.current = null;
      lastFlushedTextRef.current = "";
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      setLive((prev) =>
        Array.isArray(prev)
          ? prev.map((it) =>
              it.kind === "text" && it.id === p.id
                ? { ...it, content: p.content }
                : it,
            )
          : prev,
      );
    }

    function flushPendingThinking(): void {
      const p = pendingThinkingRef.current;
      if (!p) return;
      pendingThinkingRef.current = null;
      lastFlushedThinkingRef.current = "";
      if (flushThinkingTimerRef.current !== null) {
        clearTimeout(flushThinkingTimerRef.current);
        flushThinkingTimerRef.current = null;
      }
      setLive((prev) =>
        Array.isArray(prev)
          ? prev.map((it) =>
              it.kind === "thinking" && it.id === p.id
                ? { ...it, content: p.content }
                : it,
            )
          : prev,
      );
    }

    const toolcallArgBuffers = new Map<string, string>();

    const unsubscribe = events.subscribe((event: AgentEvent) => {
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
          // Only the FIRST text_start of the session enters scan mode.
          // After agent_end the App refreshes the system prompt without
          // the title instruction, so subsequent turns won't emit the
          // marker — but to be safe we also clear the scan flag so a
          // user message that legitimately starts with `[session-title]`
          // text can never be intercepted on turn 2+.
          if (
            titleScanRef.current === "done" &&
            opts.isFirstTurn?.() === true
          ) {
            titleScanRef.current = "scanning";
          }
          setLive((prev) => [
            ...prev,
            { kind: "text", id: currentTextId!, content: "" },
          ]);
          return;
        case "text_delta": {
          const id = currentTextId;
          if (!id) return;
          pendingTextRef.current = {
            id,
            content: (pendingTextRef.current?.content ?? "") + event.delta,
          };
          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(
              () => {
                flushTimerRef.current = null;
                const p = pendingTextRef.current;
                if (!p) return;
                if (p.content === lastFlushedTextRef.current) return;

                // Session-title scan (first turn only). Three outcomes:
                //   1. Marker matched: extract title, strip the marker
                //      line + trailing newlines from p.content, fire
                //      onSessionTitle, mark scan done, fall through
                //      to the normal flush with the cleaned content.
                //   2. No newline yet AND content still looks like the
                //      start of a marker: keep buffering (return early
                //      without flushing — the user shouldn't see the
                //      marker letters appear character-by-character).
                //   3. Content does NOT start like a marker: give up
                //      scanning, fall through to normal flush.
                if (titleScanRef.current === "scanning") {
                  const m = SESSION_TITLE_MARKER_RX.exec(p.content);
                  if (m) {
                    const title = (m[1] ?? "").trim();
                    titleScanRef.current = "done";
                    if (title.length > 0) {
                      try {
                        opts.onSessionTitle?.(title);
                      } catch {
                        /* listener errors must not crash projection */
                      }
                    }
                    const stripped = p.content.slice(m[0].length);
                    pendingTextRef.current = { id: p.id, content: stripped };
                    if (stripped.length === 0) {
                      // Nothing else to flush yet — the marker was the
                      // entire delta so far. Wait for the next chunk.
                      lastFlushedTextRef.current = "";
                      return;
                    }
                    // Fall through with the cleaned content.
                  } else if (
                    !p.content.length ||
                    "[session-title]".startsWith(p.content) ||
                    (p.content.startsWith("[session-title]") &&
                      !p.content.includes("\n"))
                  ) {
                    // Still potentially a marker, just incomplete.
                    return;
                  } else {
                    // Doesn't match and never will.
                    titleScanRef.current = "done";
                  }
                }

                const flushTarget = pendingTextRef.current;
                if (!flushTarget) return;

                // Gemini CLI message splitting: when accumulated text
                // grows beyond MAX_LIVE_CHUNK_CHARS, find a safe split
                // point and push the older portion to committed (Static)
                // history, keeping only the trailing chunk dynamic.
                if (
                  flushTarget.content.length > MAX_LIVE_CHUNK_CHARS &&
                  opts.onCommitSplit
                ) {
                  const splitAt = findLastSafeSplitPoint(flushTarget.content);
                  if (splitAt < flushTarget.content.length) {
                    const committed = flushTarget.content
                      .slice(0, splitAt)
                      .trimEnd();
                    const pending = flushTarget.content.slice(splitAt);
                    if (committed.length > 0) {
                      opts.onCommitSplit({
                        kind: "text",
                        id: randomUUID(),
                        content: committed,
                      });
                    }
                    pendingTextRef.current = {
                      id: flushTarget.id,
                      content: pending,
                    };
                    lastFlushedTextRef.current = pending;
                    setLive((prev) =>
                      Array.isArray(prev)
                        ? prev.map((it) =>
                            it.kind === "text" && it.id === flushTarget.id
                              ? { ...it, content: pending }
                              : it,
                          )
                        : prev,
                    );
                    return;
                  }
                }

                lastFlushedTextRef.current = flushTarget.content;
                setLive((prev) =>
                  Array.isArray(prev)
                    ? prev.map((it) =>
                        it.kind === "text" && it.id === flushTarget.id
                          ? { ...it, content: flushTarget.content }
                          : it,
                      )
                    : prev,
                );
              },
              flushDelay(pendingTextRef.current?.content.length ?? 0),
            );
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
            { kind: "thinking", id: currentThinkingId!, content: "" },
          ]);
          return;
        case "thinking_delta": {
          const id = currentThinkingId;
          if (!id) return;
          pendingThinkingRef.current = {
            id,
            content: (pendingThinkingRef.current?.content ?? "") + event.delta,
          };
          if (!flushThinkingTimerRef.current) {
            flushThinkingTimerRef.current = setTimeout(
              () => {
                flushThinkingTimerRef.current = null;
                const p = pendingThinkingRef.current;
                if (!p) return;
                if (p.content === lastFlushedThinkingRef.current) return;
                lastFlushedThinkingRef.current = p.content;
                setLive((prev) =>
                  Array.isArray(prev)
                    ? prev.map((it) =>
                        it.kind === "thinking" && it.id === p.id
                          ? { ...it, content: p.content }
                          : it,
                      )
                    : prev,
                );
              },
              flushDelay(pendingThinkingRef.current?.content.length ?? 0),
            );
          }
          return;
        }
        case "thinking_end":
          flushPendingThinking();
          currentThinkingId = null;
          return;
        case "toolcall_start": {
          const item: TranscriptItem = {
            kind: "tool",
            id: event.id,
            name: event.name,
            status: "pending",
            argSummary: "generating...",
            outputPreview: "",
            startedAt: Date.now(),
          };
          pendingToolUpdatesRef.current.push((prev) => [...prev, item]);
          scheduleToolFlush();
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
          toolcallArgBuffers.set(
            event.id,
            (toolcallArgBuffers.get(event.id) ?? "") + event.deltaJson,
          );
          return;
        }
        case "toolcall_end": {
          // Remove the pending "generating..." placeholder when the
          // tool call JSON is fully received. tool_exec_start follows
          // with the real item.
          const endId = event.id;
          toolcallArgBuffers.delete(endId);
          pendingToolUpdatesRef.current.push((prev) =>
            prev.filter(
              (it) =>
                !(
                  it.kind === "tool" &&
                  it.id === endId &&
                  it.status === "pending"
                ),
            ),
          );
          scheduleToolFlush();
          return;
        }
        case "tool_exec_start": {
          const item: TranscriptItem = {
            kind: "tool",
            id: event.id,
            name: event.name,
            status: "running",
            argSummary: summariseInput(event.input),
            outputPreview: "",
            startedAt: Date.now(),
          };
          pendingToolUpdatesRef.current.push((prev) => [...prev, item]);
          scheduleToolFlush();
          return;
        }
        case "tool_exec_progress": {
          const toolId = event.id;
          pendingProgressRef.current.set(
            toolId,
            (pendingProgressRef.current.get(toolId) ?? "") +
              event.message +
              "\n",
          );
          if (!progressTimerRef.current.has(toolId)) {
            progressTimerRef.current.set(
              toolId,
              setTimeout(() => {
                progressTimerRef.current.delete(toolId);
                const accumulated = pendingProgressRef.current.get(toolId);
                if (!accumulated) return;
                // Guard: the tool item may have been removed (commitLive)
                // before this timer fired. Skip if not found in liveItemsRef.
                const exists = liveItemsRef.current.some(
                  (it) =>
                    it.kind === "tool" &&
                    it.id === toolId &&
                    it.status === "running",
                );
                if (!exists) return;
                setLive((prev) =>
                  prev.map((it) =>
                    it.kind === "tool" &&
                    it.id === toolId &&
                    it.status === "running"
                      ? { ...it, outputPreview: accumulated }
                      : it,
                  ),
                );
              }, 150),
            );
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
          const isModeBlock =
            typeof event.output === "string" &&
            event.output.startsWith("[MODE BLOCK]");
          const status: ToolStatus = isModeBlock
            ? "blocked"
            : event.isError
              ? "error"
              : "done";
          const rawOutput = isModeBlock
            ? event.output.slice("[MODE BLOCK] ".length)
            : event.output;
          const diff =
            typeof event.metadata?.diff === "string"
              ? event.metadata.diff
              : undefined;
          const outputKind: "text" | "diff" | undefined =
            diff !== undefined
              ? "diff"
              : hasDiffMarkers(rawOutput)
                ? "diff"
                : "text";
          const outputText =
            outputKind === "diff" && diff !== undefined ? diff : rawOutput;
          const execEndId = event.id;
          const execEndStatus = status;
          const execEndOutput = outputText.slice(0, 2000);
          const execEndKind = outputKind;
          const execEndDuration = event.durationMs;
          pendingToolUpdatesRef.current.push((prev) =>
            prev.map((it) =>
              it.kind === "tool" && it.id === execEndId
                ? {
                    ...it,
                    status: execEndStatus,
                    outputPreview: execEndOutput,
                    outputKind: execEndKind,
                    durationMs: execEndDuration,
                  }
                : it,
            ),
          );
          scheduleToolFlush();
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
      for (const t of progressTimerRef.current.values()) clearTimeout(t);
      progressTimerRef.current.clear();
      pendingProgressRef.current.clear();
    };
  }, [events, setLive]);

  const commitLive = React.useCallback((): TranscriptItem[] => {
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
    // Cancel per-tool progress timers to prevent stale writes after commit.
    for (const t of progressTimerRef.current.values()) clearTimeout(t);
    progressTimerRef.current.clear();
    pendingProgressRef.current.clear();
    // Flush any accumulated-but-not-yet-flushed text into liveItemsRef.
    const pt = pendingTextRef.current;
    if (pt) {
      pendingTextRef.current = null;
      liveItemsRef.current = liveItemsRef.current.map((it) =>
        it.kind === "text" && it.id === pt.id
          ? { ...it, content: pt.content }
          : it,
      );
    }
    const pk = pendingThinkingRef.current;
    if (pk) {
      pendingThinkingRef.current = null;
      liveItemsRef.current = liveItemsRef.current.map((it) =>
        it.kind === "thinking" && it.id === pk.id
          ? { ...it, content: pk.content }
          : it,
      );
    }
    // Read the ref synchronously — safe from async finally blocks.
    const committed = liveItemsRef.current;
    liveItemsRef.current = [];
    setLiveItems([]);
    return committed;
  }, []);

  const appendLive = React.useCallback(
    (item: TranscriptItem): void => {
      setLive((prev) => [...prev, item]);
    },
    [setLive],
  );

  const appendLiveSync = React.useCallback(
    (item: TranscriptItem): void => {
      // Directly update the ref so commitLive() sees this item synchronously,
      // even when called from an async finally block before the React render.
      const next = [...liveItemsRef.current, item];
      liveItemsRef.current = next;
      setLiveItems(next);
    },
    [],
  );

  const clear = React.useCallback((): void => {
    liveItemsRef.current = [];
    lastFlushedTextRef.current = "";
    lastFlushedThinkingRef.current = "";
    setLiveItems([]);
    setTotals({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
  }, []);

  return React.useMemo(
    () => ({ liveItems, totals, commitLive, appendLive, appendLiveSync, clear }),
    [liveItems, totals, commitLive, appendLive, appendLiveSync, clear],
  );
}

function summariseInput(input: unknown, max = 60): string {
  if (input === undefined || input === null) return "";
  const s = typeof input === "string" ? input : safeStringify(input);
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length <= max
    ? collapsed
    : `${collapsed.slice(0, max - 1)}…`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hasDiffMarkers(result: string): boolean {
  return /^[+-]|^@@\s/m.test(result);
}
