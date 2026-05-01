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
  | { kind: "error"; id: string; message: string; failoverModel?: string }
  | { kind: "notice"; id: string; text: string };

export interface EventProjection {
  liveItems: TranscriptItem[];
  totals: UsageTotal;
  commitLive: () => TranscriptItem[];
  appendLive: (item: TranscriptItem) => void;
  clear: () => void;
}

export function useEventProjection(events: EventStream): EventProjection {
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
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    // Local ids used to attribute in-flight deltas to the right span.
    let currentTextId: string | null = null;
    let currentThinkingId: string | null = null;
    const unsubscribe = events.subscribe((event: AgentEvent) => {
      switch (event.type) {
        case "text_start":
          currentTextId = randomUUID();
          currentThinkingId = null;
          setLiveItems((prev) => [
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
            flushTimerRef.current = setTimeout(() => {
              const p = pendingTextRef.current;
              pendingTextRef.current = null;
              flushTimerRef.current = null;
              if (!p) return;
              setLiveItems((prev) =>
                prev.map((it) =>
                  it.kind === "text" && it.id === p.id
                    ? { ...it, content: p.content }
                    : it,
                ),
              );
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
            { kind: "thinking", id: currentThinkingId!, content: "" },
          ]);
          return;
        case "thinking_delta": {
          const id = currentThinkingId;
          if (!id) return;
          setLiveItems((prev) =>
            prev.map((it) =>
              it.kind === "thinking" && it.id === id
                ? { ...it, content: it.content + event.delta }
                : it,
            ),
          ) as any;
          return;
        }
        case "thinking_end":
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
          setLiveItems((prev) => [...prev, item]);
          return;
        }
        case "toolcall_delta": {
          setLiveItems((prev) =>
            prev.map((it) =>
              it.kind === "tool" &&
              it.id === event.id &&
              it.status === "pending"
                ? { ...it, argJson: (it.argJson ?? "") + event.deltaJson }
                : it,
            ),
          );
          return;
        }
        case "toolcall_end":
          // Remove the pending "generating..." placeholder when the
          // tool call JSON is fully received. tool_exec_start follows
          // with the real item.
          setLiveItems((prev) =>
            prev.filter(
              (it) =>
                !(
                  it.kind === "tool" &&
                  it.id === event.id &&
                  it.status === "pending"
                ),
            ),
          );
          return;
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
          setLiveItems((prev) => [...prev, item]);
          return;
        }
        case "tool_exec_progress": {
          setLiveItems((prev) =>
            prev.map((it) =>
              it.kind === "tool" &&
              it.id === event.id &&
              it.status === "running"
                ? {
                    ...it,
                    outputPreview: it.outputPreview + event.message + "\n",
                  }
                : it,
            ),
          );
          return;
        }
        case "tool_exec_end": {
          const status: ToolStatus = event.isError ? "error" : "done";
          const diff =
            typeof event.metadata?.diff === "string"
              ? event.metadata.diff
              : undefined;
          const outputKind: "text" | "diff" | undefined =
            diff !== undefined
              ? "diff"
              : hasDiffMarkers(event.output)
                ? "diff"
                : "text";
          const outputText =
            outputKind === "diff" && diff !== undefined ? diff : event.output;
          setLiveItems((prev) =>
            prev.map((it) =>
              it.kind === "tool" && it.id === event.id
                ? {
                    ...it,
                    status,
                    outputPreview: outputText.slice(0, 2000),
                    outputKind,
                    durationMs: event.durationMs,
                  }
                : it,
            ),
          );
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

  const commitLive = React.useCallback((): TranscriptItem[] => {
    let committed: TranscriptItem[] = [];
    setLiveItems((prev) => {
      committed = prev;
      return [];
    });
    return committed;
  }, []);

  const appendLive = React.useCallback((item: TranscriptItem): void => {
    setLiveItems((prev) => [...prev, item]);
  }, []);

  const clear = React.useCallback((): void => {
    setLiveItems([]);
    setTotals({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
  }, []);

  return { liveItems, totals, commitLive, appendLive, clear };
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
