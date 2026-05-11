/**
 * SubagentPanel — Shows running sub-agents and fleet agents.
 *
 * Monitors the event stream for:
 *   - toolcall_start/end (sub-agent delegation)
 *   - fleet_agent_start/progress/end (parallel fleet agents)
 *
 * Displays them as a running list above the prompt.
 */

import * as React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import type { EventStream } from "../../../kernel/event-stream.js";
import type { FleetAgentStatus } from "../../../fleet/types.js";

interface RunningSub {
  id: string;
  label: string;
  sub?: boolean; // true = sub-agent, false = fleet agent
  progress?: number;
  status?: FleetAgentStatus;
}

interface Props {
  events: EventStream;
}

export function SubagentPanel(props: Props): React.JSX.Element | null {
  const palette = useTheme();
  const [running, setRunning] = React.useState<RunningSub[]>([]);

  React.useEffect(() => {
    const items = new Map<string, RunningSub>();

    const unsub = props.events.subscribe((evt) => {
      if (evt.type === "toolcall_start" && evt.name === "task") {
        items.set(evt.id, { id: evt.id, label: "sub-agent", sub: true });
        setRunning(Array.from(items.values()));
      }
      if (evt.type === "toolcall_end") {
        items.delete(evt.id);
        setRunning(Array.from(items.values()));
      }
      // Fleet agent events (use any cast — FleetEvent is a separate union)
      const f = evt as any;
      if (f.type === "fleet_agent_start") {
        items.set(f.agentId, {
          id: f.agentId,
          label: f.subtask?.title ?? f.agentId,
          sub: false,
          status: "running",
        });
        setRunning(Array.from(items.values()));
      }
      if (f.type === "fleet_agent_progress") {
        const existing = items.get(f.agentId);
        if (existing) {
          existing.status = f.status;
          items.set(f.agentId, existing);
          setRunning(Array.from(items.values()));
        }
      }
      if (f.type === "fleet_agent_end") {
        items.delete(f.agentId);
        setRunning(Array.from(items.values()));
      }
    });

    return () => unsub();
  }, [props.events]);

  if (running.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0}>
      <Text color={palette.text.secondary}>
        agents ({running.length})
      </Text>
      {running.map((s) => (
        <Text key={s.id} color={palette.textMuted}>
          {"  "}🔄 {s.label}
        </Text>
      ))}
    </Box>
  );
}
