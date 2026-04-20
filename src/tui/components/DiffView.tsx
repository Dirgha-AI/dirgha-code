import React, { memo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../colors.js';
import { DiffLineItem } from './DiffLineItem.js';

const BG_ADDED = '#0d3f21', BG_REMOVED = '#4a1216', BG_HUNK = '#1b2430';
const MARK_ADDED = '#22c55e', MARK_REMOVED = '#ef4444', NUM_COLOR = '#6b7280';

const padNum = (n: any, w: number) => n === undefined ? ' '.repeat(w) : String(n).padStart(w);

export const DiffView = memo(function DiffView({ path, diff, stats, maxLines = 40 }: any) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  let maxOld = 0, maxNew = 0;
  for (const l of diff) {
    if ((l.oldNum ?? 0) > maxOld) maxOld = l.oldNum!;
    if ((l.newNum ?? 0) > maxNew) maxNew = l.newNum!;
  }
  const oldW = String(maxOld).length, newW = String(maxNew).length;
  const shown = diff.slice(0, maxLines), hidden = diff.length - shown.length;

  const getStyle = (k: '+' | '-' | ' ') => {
    if (k === '+') return { bg: BG_ADDED, mark: '+', markColor: MARK_ADDED, textColor: '#e6ffe9' };
    if (k === '-') return { bg: BG_REMOVED, mark: '-', markColor: MARK_REMOVED, textColor: '#ffe6e7' };
    return { bg: undefined, mark: ' ', markColor: NUM_COLOR, textColor: C.textSecondary };
  };

  return (
    <Box flexDirection="column" marginY={1}>
      <Box><Text color={C.brand}>●</Text><Text color={C.textPrimary}> {path}</Text>
        {stats && <Text color={C.textDim}>  <Text color={MARK_ADDED}>+{stats.added}</Text> <Text color={MARK_REMOVED}>-{stats.removed}</Text></Text>}
      </Box>
      {shown.map((line: any, i: number) => {
        if (/^@@\s/.test(line.text)) return <Box key={i} width={cols} backgroundColor={BG_HUNK}><Text color={C.textDim}>  {line.text}</Text></Box>;
        return <DiffLineItem key={i} line={line} cols={cols} oldWidth={oldW} newWidth={newW} style={getStyle(line.kind)} numColor={NUM_COLOR} padNum={padNum} />;
      })}
      {hidden > 0 && <Text color={C.textDim}>  …{hidden} more lines</Text>}
    </Box>
  );
});
