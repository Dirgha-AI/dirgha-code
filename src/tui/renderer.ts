/**
 * Streaming renderer.
 *
 * The v1 implementation is line-buffered rather than a full cell-level
 * differential renderer: it writes assistant text deltas directly to
 * stdout, emits newline-separated tool invocation banners, and prefixes
 * status changes with ANSI-coloured tokens. It is intentionally simple
 * and terminal-safe; a higher-fidelity differential renderer can be
 * layered in later without changing this module's interface.
 */

import type { AgentEvent } from '../kernel/types.js';
import { defaultTheme, noColour, style, type Theme } from './theme.js';

export interface StreamRendererOptions {
  theme?: Theme;
  colour?: boolean;
  showThinking?: boolean;
  write?: (chunk: string) => void;
}

export function renderStreamingEvents(opts: StreamRendererOptions = {}) {
  const theme = opts.colour === false ? noColour() : opts.theme ?? defaultTheme;
  const write = opts.write ?? ((chunk: string) => {
    try { process.stdout.write(chunk); }
    catch (e: any) { if (e?.code !== 'EPIPE' && e?.code !== 'EIO') throw e; }
  });
  const showThinking = opts.showThinking ?? false;
  let thinkingBannerOpen = false;

  return (event: AgentEvent): void => {
    switch (event.type) {
      case 'text_start':
        thinkingBannerOpen && write('\n');
        thinkingBannerOpen = false;
        return;
      case 'text_delta':
        write(event.delta);
        return;
      case 'text_end':
        return;
      case 'thinking_start':
        if (showThinking) {
          thinkingBannerOpen = true;
          write(style(theme.thinking, '\n• thinking… '));
        }
        return;
      case 'thinking_delta':
        if (showThinking) write(style(theme.thinking, event.delta));
        return;
      case 'thinking_end':
        if (showThinking && thinkingBannerOpen) {
          thinkingBannerOpen = false;
          write('\n');
        }
        return;
      case 'tool_exec_start': {
        const summary = summarizeToolInput(event.name, event.input);
        const head = summary ? `\n→ ${event.name} · ${summary}` : `\n→ ${event.name}`;
        write(style(theme.tool, head));
        return;
      }
      case 'tool_exec_end': {
        const token = event.isError ? theme.toolError : theme.tool;
        const verdict = event.isError ? 'error' : 'done';
        write(style(token, ` (${verdict}, ${event.durationMs}ms)\n`));
        const preview = summarizeToolOutput(event.output, event.isError);
        if (preview) write(style(token, `  ⎿ ${preview}\n`));
        return;
      }
      case 'error':
        write(style(theme.danger, `\n[error] ${event.message}\n`));
        return;
      case 'turn_end':
        write('\n');
        return;
      case 'agent_end':
        return;
    }
  };
}

const PREVIEW_MAX = 72;

function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  // Pick the most informative field for known tools first.
  const candidates = ['command', 'path', 'file_path', 'pattern', 'query', 'url', 'cmd'];
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return truncate(value, PREVIEW_MAX);
  }
  // Fall back to the first string field.
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.length > 0) return truncate(value, PREVIEW_MAX);
  }
  void name;
  return '';
}

function summarizeToolOutput(output: string, isError: boolean): string {
  if (!output) return '';
  const text = output.trim();
  if (text.length === 0) return '';
  if (isError) return truncate(text.split('\n')[0] ?? text, PREVIEW_MAX);
  const lines = text.split('\n');
  const first = lines[0] ?? '';
  if (lines.length <= 1) return truncate(first, PREVIEW_MAX);
  return `${truncate(first, PREVIEW_MAX - 12)} (+${lines.length - 1} lines)`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
