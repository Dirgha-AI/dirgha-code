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

// Drop the provider prefix from a model id so the footer reads short
// and human. e.g. `moonshotai/kimi-k2-instruct` → `kimi-k2-instruct`,
// `accounts/fireworks/models/deepseek-v3` → `deepseek-v3`.
function shortModel(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash === -1 ? model : model.slice(slash + 1);
}

interface ModeStyle { label: string; symbol: string; }

function modeStyle(mode: 'act' | 'plan' | 'verify' | 'ask' | 'yolo'): ModeStyle {
  switch (mode) {
    case 'yolo':   return { label: 'YOLO',   symbol: '⏵⏵' };
    case 'plan':   return { label: 'PLAN',   symbol: '◔'  };
    case 'verify': return { label: 'VERIFY', symbol: '✓'  };
    case 'ask':    return { label: 'ASK',    symbol: '?'  };
    case 'act':
    default:       return { label: 'ACT',    symbol: '▸'  };
  }
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
  // Strip provider prefix so the footer reads short and human.
  const modelDisplay = (() => {
    const s = shortModel(props.model);
    return s.length > 28 ? `${s.slice(0, 27)}…` : s;
  })();
  // Context meter: "12k/128k" — only renders when both ends are known.
  const contextMeter = props.contextWindow && props.contextWindow > 0 && totalTokens > 0
    ? `${formatTokens(totalTokens)}/${formatTokens(props.contextWindow)}`
    : '';
  // tok/s readout — only meaningful while a turn is streaming AND we
  // have at least one token + non-zero elapsed time. Below 250ms we'd
  // get extreme rates from a single chunk, so suppress until warmed up.
  const tokRateLabel = (() => {
    const t = props.liveOutputTokens;
    const ms = props.liveDurationMs;
    if (!props.busy) return '';
    if (typeof t !== 'number' || typeof ms !== 'number') return '';
    if (t <= 0 || ms <= 0) return '';
    if (ms < 250) return '';  // warmup: avoid spurious 1000+ tok/s readings
    const rate = Math.round((t / ms) * 1000);
    return `${rate} tok/s`;
  })();
  // Mode badge: ALWAYS visible so the user knows what posture the
  // agent is in. YOLO surfaces in the palette's error colour as a
  // danger reminder; PLAN/ASK in accent; ACT in muted to stay calm.
  const mode = props.mode ?? 'act';
  const ms = modeStyle(mode);
  const modeColour = mode === 'plan' ? palette.accent
    : mode === 'verify' ? palette.brand
    : mode === 'ask' ? palette.brand
    : mode === 'yolo' ? palette.error
    : palette.textMuted;

  // Slim status bar — only what's load-bearing:
  //   left:  ⏵⏵ MODE · cwd
  //   right: spinner (when busy) · short model · context-meter or cost
  return (
    <Box width={cols} paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color={modeColour} bold>{ms.symbol} {ms.label}</Text>
        <Text color={palette.textMuted} dimColor>·</Text>
        <Text color={palette.textMuted}>{cwdLabel(props.cwd)}</Text>
      </Box>
      <Box gap={1}>
        {props.busy && <Text color={palette.brand}>{SPINNER_FRAMES[frame]}</Text>}
        <Text color={palette.brand}>{modelDisplay}</Text>
        {props.busy && <Text color={palette.textMuted} dimColor>· Ctrl+C to stop</Text>}
        {tokRateLabel !== '' && <Text color={palette.textMuted} dimColor>{tokRateLabel}</Text>}
        {contextMeter !== '' && <Text color={palette.textMuted} dimColor>{contextMeter}</Text>}
        {costLabel !== '' && <Text color={palette.textMuted} dimColor>{costLabel}</Text>}
      </Box>
    </Box>
  );
}
