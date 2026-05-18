/**
 * SubagentDashboard — richer sub-agent lifecycle panel.
 *
 * Monitors the parent event stream for the full sub-agent lifecycle:
 *   toolcall_start -> toolcall_end       (prompt capture)
 *   tool_exec_start -> tool_exec_end     (actual execution)
 *
 * Displays running, completed, and failed sub-agents with
 * prompt label, duration, output summary.
 *
 * A separate component from SubagentPanel so the existing panel
 * can be left in place while this one evolves independently.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import type { EventStream } from "../../../kernel/event-stream.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SubagentEntry {
  id: string;
  label: string;           // first ~48 chars of the prompt
  status: "pending" | "running" | "completed" | "error";
  startedAt: number | null;
  durationMs: number | null;
  output: string | null;
  error: string | null;
}

interface Props {
  events: EventStream;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_LABEL_LEN = 48;
const MAX_OUTPUT_PREVIEW = 80;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "\u2026";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "\u2014";
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m${secs}s`;
}

function labelFromInput(input: unknown): string {
  if (input && typeof input === "object" && "prompt" in input) {
    const p = (input as { prompt: string }).prompt;
    if (typeof p === "string" && p.trim()) return truncate(p.trim(), MAX_LABEL_LEN);
  }
  return "sub-agent";
}

function outputPreview(output: string | null): string {
  if (!output) return "";
  return truncate(output.replace(/\n/g, " ").trim(), MAX_OUTPUT_PREVIEW);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SubagentDashboard(props: Props): React.JSX.Element | null {
  const palette = useTheme();
  const [entries, setEntries] = React.useState<SubagentEntry[]>([]);

  React.useEffect(() => {
    const items = new Map<string, SubagentEntry>();
    // Buffer prompts per toolcall id until toolcall_end resolves them
    const prompts = new Map<string, string>();

    const unsub = props.events.subscribe((evt) => {
      switch (evt.type) {
        case "toolcall_start": {
          if (evt.name !== "task") break;
          prompts.set(evt.id, "");
          items.set(evt.id, {
            id: evt.id,
            label: "sub-agent",
            status: "pending",
            startedAt: null,
            durationMs: null,
            output: null,
            error: null,
          });
          setEntries(Array.from(items.values()));
          break;
        }
        case "toolcall_delta": {
          const existing = prompts.get(evt.id);
          if (existing !== undefined) {
            prompts.set(evt.id, existing + evt.deltaJson);
          }
          break;
        }
        case "toolcall_end": {
          const existing = items.get(evt.id);
          if (!existing) break;
          // Extract prompt from the parsed input or fall back to the buffered delta
          const label = evt.input
            ? labelFromInput(evt.input)
            : labelFromInput(prompts.get(evt.id) ?? "");
          existing.label = label;
          setEntries(Array.from(items.values()));
          prompts.delete(evt.id);
          break;
        }
        case "tool_exec_start": {
          if (evt.name !== "task") break;
          let existing = items.get(evt.id);
          if (!existing) {
            // Race: tool_exec_start arrived before toolcall_start.
            // Create a placeholder so the entry is never silently dropped.
            existing = {
              id: evt.id,
              label: "sub-agent",
              status: "running",
              startedAt: Date.now(),
              durationMs: null,
              output: null,
              error: null,
            };
            items.set(evt.id, existing);
          } else {
            existing.status = "running";
            existing.startedAt = Date.now();
          }
          setEntries(Array.from(items.values()));
          break;
        }
        case "tool_exec_end": {
          const existing = items.get(evt.id);
          if (!existing) break;
          existing.status = evt.isError ? "error" : "completed";
          existing.durationMs = evt.durationMs ?? (existing.startedAt ? Date.now() - existing.startedAt : null);
          existing.error = evt.isError ? (evt.output ?? "unknown error") : null;
          existing.output = evt.output ?? null;
          setEntries(Array.from(items.values()));
          break;
        }
      }
    });

    return () => unsub();
  }, [props.events]);

  if (entries.length === 0) return null;

  const statusDot = (s: SubagentEntry["status"]): string => {
    switch (s) {
      case "pending":   return "\u25CB";   // o
      case "running":   return "\u25CF";   // filled circle
      case "completed": return "\u2713";   // checkmark
      case "error":     return "\u2717";   // x
    }
  };

  const statusColor = (s: SubagentEntry["status"]): string => {
    switch (s) {
      case "pending":   return palette.ui.comment;
      case "running":   return palette.text.accent;
      case "completed": return palette.status.success;
      case "error":     return palette.status.error;
    }
  };

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0}>
      <Text color={palette.text.secondary}>
        agents ({entries.length})
      </Text>
      {entries.map((s) => (
        <Box key={s.id} flexDirection="column">
          <Text>
            {"  "}
            <Text color={statusColor(s.status)}>
              {statusDot(s.status)}{" "}
            </Text>
            <Text color={palette.text.primary}>{s.label}</Text>
            <Text color={palette.text.secondary}>
              {" "}{formatDuration(s.durationMs)}
            </Text>
          </Text>
          {s.status === "completed" && s.output && (
            <Text color={palette.ui.comment}>
              {"    "}{outputPreview(s.output)}
            </Text>
          )}
          {s.status === "error" && s.error && (
            <Text color={palette.status.error}>
              {"    "}{outputPreview(s.error)}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
