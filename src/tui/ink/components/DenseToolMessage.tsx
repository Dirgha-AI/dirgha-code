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
import { SpinnerContext } from "../spinner-context.js";
import { SpinnerGlyph } from "./SpinnerGlyph.js";
import { useElapsed } from "../use-elapsed.js";
import {
  highlightContent,
  colorForKind,
  isCodeFile,
} from "../markdown/syntax-highlight.js";

export interface DenseToolMessageProps {
  name: string;
  status: ToolStatus;
  argSummary?: string;
  outputPreview?: string;
  durationMs?: number;
  startedAt?: number;
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

export const DenseToolMessage = React.memo(function DenseToolMessage(
  props: DenseToolMessageProps,
): React.JSX.Element {
  const palette = useTheme();
  const { busy } = React.useContext(SpinnerContext);

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

  const liveElapsed = useElapsed(props.startedAt ?? 0);
  const elapsed =
    props.status === "running" && props.startedAt
      ? liveElapsed
      : props.durationMs !== undefined
        ? formatElapsed(props.durationMs)
        : props.startedAt
          ? formatElapsed(Date.now() - props.startedAt)
          : "";
  const summary = props.outputPreview
    ? props.outputPreview.replace(/\s+/g, " ").slice(0, 60)
    : "";

  const summaryNode = React.useMemo((): React.ReactNode => {
    if (
      !props.outputPreview ||
      props.name !== "fs_read" ||
      !props.argSummary ||
      !isCodeFile(props.argSummary)
    ) {
      if (!summary) return null;
      return (
        <Text color={palette.text.secondary} dimColor>
          {summary}
        </Text>
      );
    }
    const tokens = highlightContent(props.outputPreview, props.argSummary);
    return (
      <Text>
        {tokens.map((tok, i) => (
          <Text key={i} color={colorForKind(tok.kind, palette)}>
            {tok.value}
          </Text>
        ))}
      </Text>
    );
  }, [props.outputPreview, props.name, props.argSummary, summary, palette]);

  const label = TOOL_LABEL[props.name] ?? props.name.replace(/_/g, " ");

  const isRunning = props.status === "running";

  return (
    <Box paddingLeft={2} flexDirection="row">
      <Box minWidth={2}>
        {isRunning ? (
          <SpinnerGlyph isActive={busy} color={glyphColour} />
        ) : (
          <Text color={glyphColour} bold={!isRunning}>
            {props.status === "error" ? TOOL_STATUS.ERROR : TOOL_STATUS.SUCCESS}
          </Text>
        )}
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
      {summaryNode && (
        <>
          <Text>{"  "}</Text>
          {summaryNode}
        </>
      )}
    </Box>
  );
});

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
