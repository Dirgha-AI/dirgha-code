/**
 * Status bar: rendered between turns. Shows model, session, turn count
 * and cumulative cost/tokens.
 */

import { style, defaultTheme } from './theme.js';
import type { UsageTotal } from '../kernel/types.js';

export interface StatusBarState {
  model: string;
  sessionId: string;
  turn: number;
  usage: UsageTotal;
}

export function renderStatusBar(state: StatusBarState, width = 80): string {
  const short = state.sessionId.slice(0, 8);
  const cost = state.usage.costUsd.toFixed(4);
  const tokens = `${state.usage.inputTokens}/${state.usage.outputTokens}`;
  const left = `[${state.model}] session:${short} turn:${state.turn}`;
  const right = `tokens ${tokens} • $${cost}`;
  const gap = Math.max(1, width - left.length - right.length);
  const line = `${left}${' '.repeat(gap)}${right}`;
  return style(defaultTheme.muted, line);
}
