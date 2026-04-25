/**
 * Status bar rendered below the input box.
 *
 * Left cluster: cwd basename + provider id.
 * Right cluster: model label + cumulative tokens + cost.
 * When busy, a subtle spinner frame appears on the right.
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';

export interface StatusBarProps {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cwd: string;
  busy: boolean;
  /** Current execution mode (act/plan/verify/ask); visible at all times. */
  mode?: 'act' | 'plan' | 'verify' | 'ask';
  /** Model's context window in tokens — drives the context meter. */
  contextWindow?: number;
  /** Output tokens from the in-progress turn. Drives the tok/s readout. */
  liveOutputTokens?: number;
  /** Wall-clock ms since the in-progress turn started. */
  liveDurationMs?: number;
}

const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function cwdLabel(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '~';
}

export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (!props.busy) return;
    const t = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return (): void => clearInterval(t);
  }, [props.busy]);

  const totalTokens = props.inputTokens + props.outputTokens;
  const tokenLabel = totalTokens > 0 ? formatTokens(totalTokens) : '';
  const costLabel = props.costUsd > 0 ? `$${props.costUsd.toFixed(3)}` : '';
  const modelShort = props.model.length > 28 ? `${props.model.slice(0, 27)}…` : props.model;
  // Context meter: "12k / 128k" — shows total used vs the model's
  // window. Only renders when both ends are known.
  const contextMeter = props.contextWindow && props.contextWindow > 0 && totalTokens > 0
    ? `${formatTokens(totalTokens)}/${formatTokens(props.contextWindow)}`
    : '';
  // Mode badge: only visible when not 'act' (the default), so the
  // status bar stays clean for normal usage.
  const modeBadge = props.mode && props.mode !== 'act' ? props.mode.toUpperCase() : '';
  const modeColour = props.mode === 'plan' ? 'yellow' : props.mode === 'verify' ? 'magenta' : props.mode === 'ask' ? 'cyan' : 'gray';
  // Live tok/s readout: only when busy AND we have wall-clock + output
  // counters from the in-progress turn. Hidden between turns to keep
  // the status bar quiet.
  const tokRate = props.busy
    && (props.liveOutputTokens ?? 0) > 0
    && (props.liveDurationMs ?? 0) >= 250
    ? `${Math.round(((props.liveOutputTokens ?? 0) / (props.liveDurationMs ?? 1)) * 1000)} tok/s`
    : '';

  return (
    <Box width={cols} paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color="gray" dimColor>●</Text>
        <Text color="gray">{cwdLabel(props.cwd)}</Text>
        <Text color="magenta" dimColor>{props.provider}</Text>
        {modeBadge !== '' && <Text color={modeColour} bold>[{modeBadge}]</Text>}
      </Box>
      <Box gap={1}>
        {props.busy && <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>}
        {tokRate !== '' && <Text color="green">{tokRate}</Text>}
        <Text color="cyan">{modelShort}</Text>
        {contextMeter !== ''
          ? <Text color="gray" dimColor>{contextMeter}</Text>
          : tokenLabel !== '' && <Text color="gray" dimColor>{tokenLabel}</Text>}
        {costLabel !== '' && <Text color="gray" dimColor>{costLabel}</Text>}
        {!props.busy && <Text color="gray" dimColor>/help</Text>}
      </Box>
    </Box>
  );
}
