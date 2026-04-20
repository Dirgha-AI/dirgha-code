/** tui/components/StatusBar.tsx — Left: mode + workspace. Right: model + cost + help. */
import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../colors.js';
import { modelLabel, formatTokens } from '../helpers.js';

interface Props {
  model: string;
  tokens: number;
  plan: boolean;
  busy: boolean;
  costUsd?: number;
  vimMode?: boolean;
  scrollMode?: boolean;
  safeMode?: boolean;
  queueStatus?: string;
  phase?: 'thinking' | 'acting' | 'writing';
  /** Count of parallel tool calls currently in flight (fleet indicator). */
  parallelCount?: number;
}

export function StatusBar({
  model, tokens, plan, busy,
  costUsd = 0, vimMode = false, scrollMode = false,
  safeMode = true, queueStatus, phase, parallelCount = 0,
}: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  const startRef = React.useRef<number>(0);
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (busy) {
      startRef.current = Date.now();
      const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
      return () => clearInterval(t);
    } else { setElapsed(0); }
  }, [busy]);

  const workspace = process.cwd().split('/').filter(Boolean).pop() ?? '~';
  const mLabel    = modelLabel(model).slice(0, 20);
  const tokStr    = tokens > 0 ? formatTokens(tokens) : '';

  return (
    <Box width={cols} paddingX={1} justifyContent="space-between">

      {/* ── Left: mode · workspace · flags ── */}
      <Box gap={1}>
        {safeMode
          ? <Text color={C.textDim} dimColor>●</Text>
          : <Text color="red" dimColor>● root</Text>
        }
        <Text color={C.textDim}>{workspace}</Text>
        {plan      && <Text color={C.accent}> plan</Text>}
        {vimMode   && <Text color="yellow"> vim</Text>}
        {scrollMode && <Text color={C.accent}> history</Text>}
        {parallelCount > 1 && <Text color={C.brand} bold> fleet × {parallelCount}</Text>}
        {queueStatus && <Text color={C.accent}> ⏳ {queueStatus}</Text>}
      </Box>

      {/* ── Right: model always · cost when nonzero · shortcuts when idle ── */}
      <Box gap={1}>
        <Text color={C.textSecondary}>{mLabel}</Text>
        {costUsd > 0 && <Text color={C.textDim}>${costUsd.toFixed(3)}</Text>}
        {busy && elapsed > 0 && <Text color={C.textDim}>{elapsed}s</Text>}
        {!busy && <Text color={C.textDim}>  /help</Text>}
      </Box>

    </Box>
  );
}
