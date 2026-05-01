/**
 * Connected-border tool group — gemini-cli pattern.
 *
 * Wraps a sequence of consecutive tool calls of one assistant turn in
 * ONE bordered region (instead of dirgha's old "round box per call").
 * The bracket reads as a single visual unit; individual tool rows
 * stack inside without their own borders.
 *
 * Compact (dense) tools render as flush single lines with no border
 * chrome — they break out of the bracket the same way gemini's
 * DenseToolMessage does. Heavy tools (shell, write, agent) render
 * with name + arg summary at the top, output preview below, all
 * inside the connected region.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { iconFor, TOOL_STATUS } from "../icons.js";
import { DenseToolMessage, isDenseTool } from "./DenseToolMessage.js";
import type { ToolStatus } from "./ToolBox.js";

export interface ToolItem {
  id: string;
  name: string;
  status: ToolStatus;
  argSummary: string;
  outputPreview: string;
  outputKind?: "text" | "diff";
  startedAt: number;
  durationMs?: number;
}

export interface ToolGroupProps {
  tools: ToolItem[];
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

const DIFF_ADD_COLOUR = "#50fa7b";
const DIFF_DEL_COLOUR = "#ff5555";
const DIFF_HUNK_COLOUR = "#00ffff";

export function ToolGroup(props: ToolGroupProps): React.JSX.Element | null {
  const palette = useTheme();
  if (props.tools.length === 0) return null;

  // Border colour follows the most-severe state: error > running > done.
  const groupColour = pickGroupColour(props.tools, palette);
  const isDimmed = props.tools.every((t) => t.status === "done");

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={groupColour}
        borderDimColor={isDimmed}
        paddingX={1}
        flexDirection="column"
      >
        {props.tools.map((tool, idx) => {
          const isLast = idx === props.tools.length - 1;
          if (isDenseTool(tool.name)) {
            return (
              <Box key={tool.id} marginBottom={isLast ? 0 : 0}>
                <DenseToolMessage
                  name={tool.name}
                  status={tool.status}
                  argSummary={tool.argSummary}
                  outputPreview={tool.outputPreview}
                  durationMs={tool.durationMs}
                  startedAt={tool.startedAt}
                />
              </Box>
            );
          }
          return (
            <FullToolRow
              key={tool.id}
              tool={tool}
              divider={!isLast}
              palette={palette}
            />
          );
        })}
      </Box>
    </Box>
  );
}

interface FullToolRowProps {
  tool: ToolItem;
  divider: boolean;
  palette: ReturnType<typeof useTheme>;
}

function FullToolRow({
  tool,
  divider,
  palette,
}: FullToolRowProps): React.JSX.Element {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    if (tool.status !== "running") return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
    return (): void => clearInterval(t);
  }, [tool.status]);

  const glyph =
    tool.status === "error"
      ? TOOL_STATUS.ERROR
      : tool.status === "done"
        ? TOOL_STATUS.SUCCESS
        : SPINNER[frame];

  const glyphColour =
    tool.status === "error"
      ? palette.status.error
      : tool.status === "done"
        ? palette.status.success
        : palette.status.warning;

  const nameColour =
    tool.status === "done"
      ? palette.text.secondary
      : tool.status === "error"
        ? palette.status.error
        : palette.text.primary;

  const elapsed =
    tool.durationMs !== undefined
      ? formatElapsed(tool.durationMs)
      : tool.status === "running"
        ? formatElapsed(Date.now() - tool.startedAt)
        : "";

  const label = TOOL_LABEL[tool.name] ?? tool.name.replace(/_/g, " ");

  const diffMode =
    tool.outputKind === "diff" ||
    (tool.outputPreview !== undefined &&
      /^[+-]|^@@\s/m.test(tool.outputPreview));

  const preview =
    !diffMode && tool.outputPreview
      ? tool.outputPreview.replace(/\s+/g, " ").slice(0, 200)
      : "";

  const diffLines =
    diffMode && tool.outputPreview
      ? tool.outputPreview.split("\n").slice(0, 30)
      : [];

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box minWidth={2}>
          <Text color={glyphColour} bold={tool.status !== "running"}>
            {glyph}
          </Text>
        </Box>
        <Text color={palette.text.accent}>{iconFor(tool.name)}</Text>
        <Text> </Text>
        <Text bold color={nameColour}>
          {label}
        </Text>
        {tool.argSummary && tool.argSummary.length > 0 && (
          <>
            <Text> </Text>
            <Text color={palette.text.secondary}>{tool.argSummary}</Text>
          </>
        )}
        {elapsed && (
          <>
            <Text>{"  "}</Text>
            <Text color={palette.text.secondary} dimColor>
              {elapsed}
            </Text>
          </>
        )}
      </Box>
      {preview && (
        <Box paddingLeft={4}>
          <Text color={palette.text.secondary} dimColor>
            ⎿ {preview}
          </Text>
        </Box>
      )}
      {diffLines.length > 0 && (
        <Box paddingLeft={4} flexDirection="column">
          {diffLines.map((line, i) => {
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
          })}
        </Box>
      )}
      {divider && (
        <Box>
          <Text color={palette.border.default} dimColor>
            {" "}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function pickGroupColour(
  tools: ToolItem[],
  palette: ReturnType<typeof useTheme>,
): string {
  if (tools.some((t) => t.status === "error")) return palette.status.error;
  if (tools.some((t) => t.status === "running")) return palette.ui.focus;
  return palette.border.default;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
