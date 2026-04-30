/**
 * Dense (compact) tool-call render.
 *
 * For high-frequency tools where the output is "look at me" rather than
 * "stop and read me" — fs_read, search_grep, search_glob, fs_ls, fs_edit.
 * Renders as a SINGLE indented line with no border:
 *
 *   ✓ Read   src/tui/theme.ts                  42ms
 *   ✓ Grep   "borderStyle"  src/tui/ink/...    18ms  3 matches
 *   ✗ Edit   src/cli/config.ts                  2ms  permission denied
 *
 * Sits flush with surrounding `<ToolGroup>` rows (no own border) so the
 * group's outer bracket reads as one continuous block.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { iconFor, TOOL_STATUS } from "../icons.js";
import type { ToolStatus } from "./ToolBox.js";

export interface DenseToolMessageProps {
  name: string;
  status: ToolStatus;
  argSummary?: string;
  outputPreview?: string;
  durationMs?: number;
  startedAt?: number;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

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

export function DenseToolMessage(
  props: DenseToolMessageProps,
): React.JSX.Element {
  const palette = useTheme();
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (props.status !== "running") return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
    return (): void => clearInterval(t);
  }, [props.status]);

  const glyph =
    props.status === "error"
      ? TOOL_STATUS.ERROR
      : props.status === "done"
        ? TOOL_STATUS.SUCCESS
        : SPINNER[frame];

  const glyphColour =
    props.status === "error"
      ? palette.status.error
      : props.status === "done"
        ? palette.status.success
        : palette.status.warning;

  const nameColour =
    props.status === "done"
      ? palette.text.secondary
      : props.status === "error"
        ? palette.status.error
        : palette.text.primary;

  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (props.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [props.status]);

  const liveMs =
    props.status === "running" && props.startedAt
      ? now - props.startedAt
      : undefined;
  const elapsed = formatElapsed(liveMs ?? props.durationMs ?? 0);
  const summary = props.outputPreview
    ? props.outputPreview.replace(/\s+/g, " ").slice(0, 60)
    : "";

  const label = TOOL_LABEL[props.name] ?? props.name.replace(/_/g, " ");

  return (
    <Box paddingLeft={2} flexDirection="row">
      <Box minWidth={2}>
        <Text color={glyphColour} bold={props.status !== "running"}>
          {glyph}
        </Text>
      </Box>
      <Text color={palette.text.accent}>{iconFor(props.name)}</Text>
      <Text> </Text>
      <Text bold color={nameColour}>
        {label}
      </Text>
      {props.argSummary && props.argSummary.length > 0 && (
        <>
          <Text> </Text>
          <Text color={palette.text.secondary}>{props.argSummary}</Text>
        </>
      )}
      {props.durationMs !== undefined && (
        <>
          <Text>{"  "}</Text>
          <Text color={palette.text.secondary} dimColor>
            {elapsed}
          </Text>
        </>
      )}
      {summary && (
        <>
          <Text>{"  "}</Text>
          <Text color={palette.text.secondary} dimColor>
            {summary}
          </Text>
        </>
      )}
    </Box>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Tools that should render compactly (single line, no border) by default. */
const DENSE_TOOLS = new Set([
  "fs_read",
  "fs_ls",
  "fs_edit",
  "search_grep",
  "search_glob",
  "git",
  "git_commit",
]);

export function isDenseTool(name: string): boolean {
  return DENSE_TOOLS.has(name);
}
