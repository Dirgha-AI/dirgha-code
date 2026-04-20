import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { C } from '../colors.js';

export function ActivitySummary({ busy, timeline, taskStartedAt, fmtDuration, activeToolSummary }: any) {
  const [, tick] = useState(0), [dim, setDim] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => tick(n => n + 1), 2000), b = setInterval(() => setDim(d => !d), 2000);
    return () => { clearInterval(t); clearInterval(b); };
  }, [busy]);
  if (!busy) return null;

  const elapsed = fmtDuration(Date.now() - taskStartedAt);
  const toolSum = activeToolSummary(timeline);
  const doneCount = timeline.filter((e: any) => e.kind === 'tool' && e.done).length;
  const verb = timeline.some((e: any) => e.kind === 'text') ? 'Writing' : timeline.some((e: any) => e.kind === 'tool') ? 'Working' : 'Thinking';
  const detail = toolSum || (doneCount > 0 ? `${doneCount} step${doneCount !== 1 ? 's' : ''} done` : '');

  return (
    <Box paddingX={2} marginBottom={1} gap={1}>
      <Text color={dim ? C.textDim : C.brand} dimColor={dim}>⊙</Text>
      <Text color={C.textMuted}>{verb} for</Text>
      <Text color={C.textSecondary}>{elapsed}</Text>
      {detail ? <Text color={C.textDim}>· {detail}</Text> : null}
    </Box>
  );
}
