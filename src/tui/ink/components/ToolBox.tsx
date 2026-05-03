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
import { SpinnerGlyph } from "./SpinnerGlyph.js";
import { useElapsed } from "../use-elapsed.js";
import {
  highlightContent,
  colorForKind,
  isCodeFile,
} from "../markdown/syntax-highlight.js";

export type ToolStatus = "pending" | "running" | "done" | "error" | "blocked";

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

// Diff colours are computed from the theme palette inside the component.
// Module-level constants removed — see renderDiffLines for theme usage.

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

function renderDiffLines(
  text: string,
  limit: number,
  palette: any,
): React.ReactNode[] {
  const addColour = palette.status.success ?? "#50fa7b";
  const delColour = palette.status.error ?? "#ff5555";
  const hunkColour = palette.ui.focus ?? "#00ffff";
  const lines = text.split("\n").slice(0, limit);
  return lines.map((line, i) => {
    let colour: string | undefined;
    if (line.startsWith("+") && !line.startsWith("+++")) colour = addColour;
    else if (line.startsWith("-") && !line.startsWith("---"))
      colour = delColour;
    else if (/^@@\s/.test(line)) colour = hunkColour;
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

export const ToolBox = React.memo(function ToolBox(
  props: ToolBoxProps,
): React.JSX.Element {
  const palette = useTheme();
  const isRunning =
    props.status !== "done" &&
    props.status !== "error" &&
    props.status !== "blocked";

  const icon =
    props.status === "error"
      ? "✗"
      : props.status === "done"
        ? "✓"
        : props.status === "blocked"
          ? "○"
          : null;
  const iconColour =
    props.status === "error"
      ? palette.status.error
      : props.status === "blocked"
        ? palette.status.warning
        : palette.ui.focus;
  const borderColour =
    props.status === "error"
      ? palette.status.error
      : props.status === "blocked"
        ? palette.status.warning
        : props.status === "done"
          ? palette.border.default
          : palette.ui.focus;

  const liveElapsed = useElapsed(props.startedAt);
  const elapsedLabel =
    props.status === "blocked"
      ? ""
      : props.status === "running"
        ? liveElapsed
        : props.durationMs !== undefined
          ? formatElapsed(props.durationMs)
          : "";
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
        {icon !== null ? (
          <Text color={iconColour}>{icon}</Text>
        ) : (
          <SpinnerGlyph isActive={isRunning} color={palette.ui.focus} />
        )}
        <Text
          color={
            props.status === "error"
              ? palette.status.error
              : palette.text.accent
          }
          bold
        >
          {iconFor(props.name)}
        </Text>
        <Text
          color={
            props.status === "error"
              ? palette.status.error
              : props.status === "done" || props.status === "blocked"
                ? palette.text.secondary
                : palette.text.primary
          }
          bold={props.status !== "blocked"}
          dimColor={props.status === "blocked"}
        >
          {prettyName(props.name)}
        </Text>
        {props.argSummary !== undefined && props.argSummary.length > 0 && (
          <Text color={palette.text.secondary} dimColor>
            ({props.argSummary})
          </Text>
        )}
        {elapsedLabel !== "" && (
          <Text color={palette.text.secondary} dimColor>
            {elapsedLabel}
          </Text>
        )}
        {props.status === "blocked" && (
          <Text color={palette.status.warning}>(blocked)</Text>
        )}
      </Box>
      {preview !== "" && !diffMode && (
        <Box>
          {props.name === "fs_read" &&
          props.argSummary &&
          isCodeFile(props.argSummary) &&
          props.outputPreview ? (
            <Text>
              {highlightContent(props.outputPreview, props.argSummary).map(
                (tok, i) => (
                  <Text key={i} color={colorForKind(tok.kind, palette)}>
                    {tok.value}
                  </Text>
                ),
              )}
            </Text>
          ) : (
            <Text color={palette.text.secondary} dimColor>
              {preview}
            </Text>
          )}
        </Box>
      )}
      {diffMode && props.outputPreview && (
        <Box flexDirection="column">
          {renderDiffLines(props.outputPreview, 30, palette)}
        </Box>
      )}
    </Box>
  );
});
