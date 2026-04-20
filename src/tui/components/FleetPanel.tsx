/**
 * tui/components/FleetPanel.tsx — Live fleet dashboard.
 *
 * Subscribes to `fleetEvents` from src/fleet/events.ts and renders a
 * side-panel row per agent: status dot, title, branch, elapsed time.
 * Panel hides when no fleet is active.
 */
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';
import { fleetEvents } from '../../fleet/events.js';
import type { FleetAgent } from '../../fleet/types.js';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function FleetRow({ agent, frame }: { agent: FleetAgent; frame: number }) {
  const dot =
    agent.status === 'running'   ? { ch: SPINNER[frame % SPINNER.length], color: C.accent } :
    agent.status === 'completed' ? { ch: '✓', color: C.brand } :
    agent.status === 'failed'    ? { ch: '✗', color: C.error } :
    agent.status === 'cancelled' ? { ch: '⊘', color: C.textDim } :
                                    { ch: '○', color: C.textDim };

  const elapsed = agent.completedAt && agent.startedAt
    ? `${Math.floor((agent.completedAt - agent.startedAt) / 1000)}s`
    : agent.startedAt
      ? `${Math.floor((Date.now() - agent.startedAt) / 1000)}s`
      : '';

  const title = agent.subtask.title.slice(0, 30);
  const branchTag = agent.branchName.split('/').slice(-1)[0] ?? '';

  return (
    <Box gap={1}>
      <Text color={dot.color}>{dot.ch}</Text>
      <Text color={C.textPrimary}>{title.padEnd(30)}</Text>
      <Text color={C.textDim}>{branchTag.slice(0, 16).padEnd(16)}</Text>
      <Text color={C.textDim}>{elapsed}</Text>
    </Box>
  );
}

export function FleetPanel() {
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [active, setActive] = useState(false);
  const [frame, setFrame] = useState(0);
  const [goal, setGoal] = useState<string | null>(null);

  useEffect(() => {
    const onState = (ev: { agents: FleetAgent[]; goal?: string }) => {
      setAgents(ev.agents);
      if (ev.goal) setGoal(ev.goal);
    };
    const onLaunch = (ev: { agents: FleetAgent[]; goal?: string }) => {
      setActive(true);
      setAgents(ev.agents);
      setGoal(ev.goal ?? null);
    };
    const onDone = (ev: { agents: FleetAgent[] }) => {
      setAgents(ev.agents);
      // Keep panel visible for 5s post-completion so user sees results
      setTimeout(() => setActive(false), 5000);
    };
    fleetEvents.on('state', onState);
    fleetEvents.on('launch', onLaunch);
    fleetEvents.on('done', onDone);
    // Also pick up current state if the panel mounts mid-fleet
    if (fleetEvents.active) {
      setActive(true);
      setAgents(fleetEvents.current);
      setGoal(fleetEvents.goal);
    }
    return () => {
      fleetEvents.off('state', onState);
      fleetEvents.off('launch', onLaunch);
      fleetEvents.off('done', onDone);
    };
  }, []);

  // Spinner animation while any agent is running
  useEffect(() => {
    const anyRunning = agents.some(a => a.status === 'running');
    if (!anyRunning) return;
    const t = setInterval(() => setFrame(f => (f + 1) % SPINNER.length), 80);
    return () => clearInterval(t);
  }, [agents]);

  if (!active || agents.length === 0) return null;

  const running   = agents.filter(a => a.status === 'running').length;
  const done      = agents.filter(a => a.status === 'completed').length;
  const failed    = agents.filter(a => a.status === 'failed' || a.status === 'cancelled').length;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={C.brand} paddingX={1} marginTop={1} marginBottom={1}>
      <Box gap={1}>
        <Text color={C.brand} bold>fleet</Text>
        <Text color={C.textDim}>
          {running > 0 ? `${running} running · ` : ''}
          {done} done · {failed} failed
        </Text>
      </Box>
      {goal && (
        <Box marginBottom={1}>
          <Text color={C.textMuted} italic>{goal.slice(0, 80)}{goal.length > 80 ? '…' : ''}</Text>
        </Box>
      )}
      {agents.map((a) => <FleetRow key={a.id} agent={a} frame={frame} />)}
    </Box>
  );
}
