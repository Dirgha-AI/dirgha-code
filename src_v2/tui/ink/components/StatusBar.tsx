/**
 * Status bar rendered below the input box.
 *
 * Left cluster: cwd basename + provider id.
 * Right cluster: model label + cumulative tokens + cost.
 * When busy, a subtle spinner frame appears on the right.
 */

import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';

export interface StatusBarProps {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cwd: string;
  busy: boolean;
  /** Current execution mode; badge hidden when 'act' (the default). */
  mode?: 'act' | 'plan' | 'verify' | 'ask' | 'yolo';
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
  const palette = useTheme();
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
  const costLabel = props.costUsd > 0 ? `$${props.costUsd.toFixed(3)}` : '';
  const modelShort = props.model.length > 28 ? `${props.model.slice(0, 27)}…` : props.model;
  // Context meter: "12k/128k" — only renders when both ends are known.
  const contextMeter = props.contextWindow && props.contextWindow > 0 && totalTokens > 0
    ? `${formatTokens(totalTokens)}/${formatTokens(props.contextWindow)}`
    : '';
  // Mode badge: hidden when in default 'act' so the bar stays quiet.
  // YOLO surfaces in the palette's error colour as a danger reminder.
  const modeBadge = props.mode && props.mode !== 'act' ? props.mode.toUpperCase() : '';
  const modeColour = props.mode === 'plan' ? palette.accent
    : props.mode === 'verify' ? palette.brand
    : props.mode === 'ask' ? palette.brand
    : props.mode === 'yolo' ? palette.error
    : palette.textMuted;

  // Slim status bar — only what's load-bearing:
  //   left:  cwd · mode badge (when not 'act')
  //   right: spinner (when busy) · model · context-meter or cost
  // Drops: decorative dot, provider id (model name implies it),
  // /help hint, redundant token count when meter is present, tok/s.
  return (
    <Box width={cols} paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color={palette.textMuted}>{cwdLabel(props.cwd)}</Text>
        {modeBadge !== '' && <Text color={modeColour} bold>[{modeBadge}]</Text>}
      </Box>
      <Box gap={1}>
        {props.busy && <Text color={palette.brand}>{SPINNER_FRAMES[frame]}</Text>}
        <Text color={palette.brand}>{modelShort}</Text>
        {contextMeter !== '' && <Text color={palette.textMuted} dimColor>{contextMeter}</Text>}
        {costLabel !== '' && <Text color={palette.textMuted} dimColor>{costLabel}</Text>}
      </Box>
    </Box>
  );
}
