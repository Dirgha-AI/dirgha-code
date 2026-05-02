/**
 * Tool invocation block.
 *
 * Consumes the state that App derives from tool_exec_start and
 * tool_exec_end events. While a tool is in flight we render a spinner;
 * on completion we show ✓ or ✗ plus the elapsed time and a short
 * output preview. No state is owned here — App is the source of truth
 * so history stays immutable after scroll-off.
 *
 * Diff-aware rendering: when outputKind is "diff" or the output
 * contains unified-diff markers, lines are coloured green (+) /
 * red (-) / cyan (@@) to match monorepo patterns.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { iconFor } from "../icons.js";
import { useTheme } from "../theme-context.js";
import { SpinnerContext, SPINNER_FRAMES } from "../spinner-context.js";

export type ToolStatus = "pending" | "running" | "done" | "error";

export interface ToolBoxProps {
  name: string;
  status: ToolStatus;
  argSummary?: string;
  outputPreview?: string;
  outputKind?: "text" | "diff";
  durationMs?: number;
  startedAt: number;
}

const TOOL_LABEL: Record<string, string> = {
  fs_read: "Read",
  fs_write: "Write",
  fs_edit: "Edit",
  fs_ls: "List",
  search_grep: "Grep",
  search_glob: "Glob",
  shell: "Shell",
  git: "Git",
  task: "Task",
};

const DIFF_ADD_COLOUR = "#50fa7b";
const DIFF_DEL_COLOUR = "#ff5555";
const DIFF_HUNK_COLOUR = "#00ffff";

function prettyName(name: string): string {
  return TOOL_LABEL[name] ?? name.replace(/_/g, " ");
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function hasDiffMarkers(text: string): boolean {
  return /^[+-]|^@@\s/m.test(text);
}

function isDiffOutput(props: ToolBoxProps): boolean {
  if (props.outputKind === "diff") return true;
  if (props.outputPreview && hasDiffMarkers(props.outputPreview)) return true;
  return false;
}

function renderDiffLines(text: string, limit: number): React.ReactNode[] {
  const lines = text.split("\n").slice(0, limit);
  return lines.map((line, i) => {
    let colour: string | undefined;
    if (line.startsWith("+") && !line.startsWith("+++"))
      colour = DIFF_ADD_COLOUR;
    else if (line.startsWith("-") && !line.startsWith("---"))
      colour = DIFF_DEL_COLOUR;
    else if (/^@@\s/.test(line)) colour = DIFF_HUNK_COLOUR;
    return (
      <Box key={i} flexDirection="row">
        <Text color={colour} dimColor={!colour}>
          {line || " "}
        </Text>
      </Box>
    );
  });
}

/** Short single-line preview for collapsed diff output. */
function diffShortPreview(text: string, maxLen = 80): string {
  const first = text
    .split("\n")
    .find((l) => l.startsWith("+") || l.startsWith("-"));
  if (!first) return text.replace(/\s+/g, " ").slice(0, maxLen);
  return first.replace(/\s+/g, " ").slice(0, maxLen) + "\u2026";
}

export function ToolBox(props: ToolBoxProps): React.JSX.Element {
  const palette = useTheme();
  const frame = React.useContext(SpinnerContext);
  const tick = frame;

  const icon =
    props.status === "error"
      ? "✗"
      : props.status === "done"
        ? "✓"
        : SPINNER_FRAMES[frame];
  const iconColour =
    props.status === "error"
      ? palette.error
      : props.status === "done"
        ? palette.brand
        : palette.brand;
  const borderColour =
    props.status === "error"
      ? palette.error
      : props.status === "done"
        ? palette.borderIdle
        : palette.brand;

  const elapsedLabel =
    props.status === "running"
      ? formatElapsed(Date.now() - props.startedAt)
      : props.durationMs !== undefined
        ? formatElapsed(props.durationMs)
        : "";
  void tick;

  const diffMode = isDiffOutput(props);

  const preview =
    !diffMode && props.outputPreview
      ? props.outputPreview.replace(/\s+/g, " ").slice(0, 80)
      : diffMode && props.outputPreview
        ? diffShortPreview(props.outputPreview, 80)
        : "";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColour}
      paddingX={1}
      marginBottom={1}
    >
      <Box gap={1}>
        <Text color={iconColour}>{icon}</Text>
        <Text color={palette.accent} bold>
          {iconFor(props.name)}
        </Text>
        <Text
          color={
            props.status === "done" ? palette.textMuted : palette.textPrimary
          }
          bold
        >
          {prettyName(props.name)}
        </Text>
        {props.argSummary !== undefined && props.argSummary.length > 0 && (
          <Text color={palette.textMuted} dimColor>
            ({props.argSummary})
          </Text>
        )}
        {elapsedLabel !== "" && (
          <Text color={palette.textMuted} dimColor>
            {elapsedLabel}
          </Text>
        )}
      </Box>
      {preview !== "" && !diffMode && (
        <Box>
          <Text color={palette.textMuted} dimColor>
            {preview}
          </Text>
        </Box>
      )}
      {diffMode && props.outputPreview && (
        <Box flexDirection="column">
          {renderDiffLines(props.outputPreview, 30)}
        </Box>
      )}
    </Box>
  );
}
