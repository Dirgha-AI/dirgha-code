/**
 * SubagentPanel — Shows running sub-agents in a collapsible panel.
 *
 * Monitors the event stream for toolcall_start/toolcall_end events where
 * the tool name is "task" (sub-agent delegation). Displays them as a
 * running list above the prompt.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import type { EventStream } from "../../../kernel/event-stream.js";

interface RunningSub {
  id: string;
  name: string;
}

interface Props {
  events: EventStream;
}

export function SubagentPanel(props: Props): React.JSX.Element | null {
  const palette = useTheme();
  const [running, setRunning] = React.useState<RunningSub[]>([]);

  React.useEffect(() => {
    const subs = new Map<string, string>(); // id → name

    const unsub = props.events.subscribe((evt) => {
      if (evt.type === "toolcall_start" && evt.name === "task") {
        subs.set(evt.id, evt.name);
        setRunning(
          Array.from(subs.entries()).map(([id, name]) => ({ id, name })),
        );
      }
      if (evt.type === "toolcall_end") {
        subs.delete(evt.id);
        setRunning(
          Array.from(subs.entries()).map(([id, name]) => ({ id, name })),
        );
      }
    });

    return () => unsub();
  }, [props.events]);

  if (running.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0}>
      <Text color={palette.text.secondary}>
        sub-agents ({running.length})
      </Text>
      {running.map((s) => (
        <Text key={s.id} color={palette.textMuted}>
          {"  "}🔄 sub-agent
        </Text>
      ))}
    </Box>
  );
}
