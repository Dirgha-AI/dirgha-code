/** tui/components/StatusBar.tsx — Left: mode + workspace. Right: model + cost + help. */
import React, { useEffect, useRef, useState } from 'react';
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
}

export function StatusBar({
  model, tokens, plan, busy,
  costUsd = 0, vimMode = false, scrollMode = false,
  safeMode = true, queueStatus, phase,
}: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  const startRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (busy) {
      startRef.current = Date.now();
      const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
      return () => clearInterval(t);
    } else { setElapsed(0); }
  }, [busy]);

  const workspace = process.cwd().split('/').filter(Boolean).pop() ?? '~';
  const mLabel    = modelLabel(model).slice(0, 20);
  const tokStr    = tokens > 0 ? formatTokens(tokens) : '';
  const adminMode = process.env['DIRGHA_ADMIN'] === '1' || process.env['DIRGHA_ADMIN'] === 'true';

  return (
    <Box width={cols} paddingX={1} justifyContent="space-between">

      {/* ── Left: brand mark · mode · workspace · flags ── */}
      <Box gap={1}>
        <Text color={C.brand}>◈</Text>
        {safeMode
          ? <Text color={C.textDim} dimColor>●</Text>
          : <Text color="red" dimColor>● root</Text>
        }
        <Text color={C.textDim}>{workspace}</Text>
        {plan      && <Text color={C.accent}> plan</Text>}
        {vimMode   && <Text color="yellow"> vim</Text>}
        {scrollMode && <Text color={C.accent}> history</Text>}
        {queueStatus && <Text color={C.accent}> ⏳ {queueStatus}</Text>}
        {adminMode && <Text color="magenta" bold> admin</Text>}
      </Box>

      {/* ── Right: busy → model+cost+elapsed · idle → just /help ── */}
      <Box gap={1}>
        {busy ? (
          <>
            <Text color={C.textSecondary}>{mLabel}</Text>
            {tokStr ? <Text color={C.textDim}>{tokStr}</Text> : null}
            {costUsd > 0 ? <Text color={C.textDim}>${costUsd.toFixed(3)}</Text> : null}
            {elapsed > 0 ? <Text color={C.textDim}>{elapsed}s</Text> : null}
          </>
        ) : (
          <Text color={C.textDim}>/help</Text>
        )}
      </Box>

    </Box>
  );
}
