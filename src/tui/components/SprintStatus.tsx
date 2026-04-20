import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { SprintJournal } from '../../sprint/journal.js';
import { getStatusColor, formatElapsed } from './SprintHelpers.js';
import { SprintTaskRow } from './SprintTaskRow.js';

export function SprintStatus({ sprintId }: any) {
  const { exit } = useApp(), [prog, setProg] = useState<any>(null), [pauseHelp, setPauseHelp] = useState(false);
  useEffect(() => {
    const j = new SprintJournal(sprintId), f = () => { try { setProg(j.getProgress()); } catch {} };
    f(); const i = setInterval(f, 2000); return () => clearInterval(i);
  }, [sprintId]);

  useInput(i => {
    if (i === 'q' || i === 'Q') exit();
    if (i === 'p' || i === 'P') { setPauseHelp(true); setTimeout(() => setPauseHelp(false), 3000); }
  });

  if (!prog) return <Box><Text>Loading sprint {sprintId}...</Text></Box>;
  return (
    <Box flexDirection="column">
      <Box><Text>Sprint: <Text bold>{sprintId}</Text> | Goal: <Text bold>{prog.goal}</Text></Text></Box>
      <Box><Text>Status: <Text color={getStatusColor(prog.status)}>{prog.status}</Text> | Elapsed: {formatElapsed(prog.elapsedMs)}</Text></Box>
      <Box marginTop={1} flexDirection="column">
        <Box><Box width={40}><Text bold>Task</Text></Box><Box width={12}><Text bold>Status</Text></Box><Box width={12}><Text bold>Time</Text></Box><Box width={8}><Text bold>Retries</Text></Box></Box>
        {prog.tasks?.map((t: any) => <SprintTaskRow key={t.taskId} task={t} />)}
      </Box>
      {pauseHelp && <Box marginTop={1}><Text color="cyan">Press [P] to pause/resume the sprint execution</Text></Box>}
      <Box marginTop={1}><Text dimColor>[P] Pause instructions | [Q] Quit view</Text></Box>
    </Box>
  );
}
export default SprintStatus;
