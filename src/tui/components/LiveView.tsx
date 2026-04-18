/** tui/components/LiveView.tsx — Chronological stream with Dirgha symbol vocabulary */
import React, { useState, useEffect, memo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { C } from '../colors.js';
import { renderMd } from '../helpers.js';

// ── Dirgha symbol vocabulary ──────────────────────────────────────────────────
// ⊙  brand / primary mark
// ∇  thinking / computing
// ∎  done / proved
// ∴  read / search / arriving at
// ⊕  write / create / build
// ∂  execute / run / partial step
// ⋈  fetch / join / synthesise
// ≡  git / verify / confirmed identical
// ⋆  system / notable
// ∿  streaming text flow

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Read', write_file: 'Write', edit_file: 'Edit', edit_file_all: 'Edit',
  apply_patch: 'Patch', run_command: 'Run', bash: 'Bash', search_files: 'Search',
  list_files: 'List', glob: 'Glob', repo_map: 'Map', web_fetch: 'Fetch',
  web_search: 'Search', git_status: 'GitStatus', git_diff: 'GitDiff',
  git_commit: 'Commit', checkpoint: 'Checkpoint', make_dir: 'Mkdir',
  delete_file: 'Delete', git_log: 'GitLog', git_branch: 'Branch',
  git_push: 'Push', git_stash: 'Stash',
};

function toolSymbol(name: string): string {
  if (['read_file', 'glob', 'list_files', 'search_files', 'repo_map', 'web_search'].includes(name)) return '∴';
  if (['write_file', 'edit_file', 'edit_file_all', 'apply_patch', 'make_dir', 'delete_file'].includes(name)) return '⊕';
  if (['bash', 'run_command'].includes(name)) return '∂';
  if (['web_fetch'].includes(name)) return '⋈';
  if (['git_status', 'git_diff', 'git_log', 'git_commit', 'git_branch', 'git_push', 'git_stash', 'checkpoint'].includes(name)) return '≡';
  if (name === 'spawn_agent') return '⋈';
  return '∂';
}

// ── Types ─────────────────────────────────────────────────────────────────────

import type { DiffLine } from '../../types.js';
import { DiffView } from './DiffView.js';

export type LiveEvent =
  | { kind: 'thinking'; text: string; done?: boolean }
  | {
      kind: 'tool';
      name: string;
      label: string;
      arg: string;
      startedAt: number;
      done: boolean;
      diff?: DiffLine[];
      diffStats?: { added: number; removed: number };
      path?: string;
    }
  | { kind: 'text'; text: string; done?: boolean };

export interface ActiveTurn {
  name: string; label: string; agentNum?: number;
  startedAt?: number; input?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayLabel(name: string, label: string): string {
  if (label?.startsWith('Agent')) return label;
  return TOOL_LABELS[name] ?? label ?? name;
}

function shortPath(val: string): string {
  if (!val) return '';
  if (val.startsWith('/')) {
    const parts = val.split('/').filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join('/') : (parts[0] ?? val);
  }
  return val.length > 42 ? val.slice(0, 39) + '…' : val;
}

/**
 * Per-tool arg pretty printer — turns raw JSON (like spawn_agent's
 * {"type":"explore","task":"..."}) into a human-readable summary line.
 */
function prettyToolArg(name: string, rawArg: string): string {
  if (!rawArg) return '';
  let parsed: any;
  try { parsed = JSON.parse(rawArg); } catch { return shortPath(rawArg); }
  if (!parsed || typeof parsed !== 'object') return shortPath(rawArg);

  if (name === 'spawn_agent') {
    const type = parsed.type ?? 'agent';
    const task = typeof parsed.task === 'string' ? parsed.task : '';
    const short = task.length > 56 ? task.slice(0, 53) + '…' : task;
    return short ? `${type} · ${short}` : type;
  }
  if (name === 'bash' || name === 'run_command') {
    const cmd = parsed.command ?? parsed.cmd ?? '';
    return shortPath(String(cmd));
  }
  if (name === 'read_file' || name === 'write_file' || name === 'edit_file' || name === 'edit_file_all' || name === 'apply_patch' || name === 'delete_file' || name === 'make_dir') {
    return shortPath(parsed.path ?? parsed.file_path ?? '');
  }
  if (name === 'search_files' || name === 'glob') {
    return shortPath(parsed.pattern ?? parsed.query ?? '');
  }
  if (name === 'web_fetch' || name === 'web_search') {
    return shortPath(parsed.url ?? parsed.query ?? '');
  }
  // Default: show first two string-valued fields.
  const parts: string[] = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string' && v) parts.push(`${k}: ${v}`);
    if (parts.length >= 2) break;
  }
  return shortPath(parts.join(' · '));
}

function lastThinkLines(text: string): string[] {
  return (text ?? '').split('\n').filter(l => l.trim()).slice(-3);
}

function fmtElapsed(startedAt: number): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return s > 0 ? `${s}s` : '';
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r > 0 ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function activeToolSummary(timeline: LiveEvent[]): string {
  const active = timeline.filter(e => e.kind === 'tool' && !(e as any).done) as Extract<LiveEvent, { kind: 'tool' }>[];
  if (active.length === 0) return '';
  const counts: Record<string, number> = {};
  for (const t of active) {
    const kind = ['bash', 'run_command'].includes(t.name) ? 'shell'
      : ['read_file', 'glob', 'list_files', 'search_files'].includes(t.name) ? 'read'
      : ['write_file', 'edit_file', 'edit_file_all', 'apply_patch'].includes(t.name) ? 'write'
      : displayLabel(t.name, t.label).toLowerCase();
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([kind, n]) => `${n} ${kind}${n > 1 ? 's' : ''} running`)
    .join(' · ');
}

// ── ActivitySummary ───────────────────────────────────────────────────────────

interface SummaryProps {
  busy: boolean;
  timeline: LiveEvent[];
  taskStartedAt: number;
}

export function ActivitySummary({ busy, timeline, taskStartedAt }: SummaryProps) {
  const [, tick]      = useState(0);
  const [dim, setDim] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const ticker   = setInterval(() => tick(n => n + 1), 2000);
    const breather = setInterval(() => setDim(d => !d), 2000);
    return () => { clearInterval(ticker); clearInterval(breather); };
  }, [busy]);

  if (!busy) return null;

  const elapsed     = fmtDuration(Date.now() - taskStartedAt);
  const toolSummary = activeToolSummary(timeline);
  const doneCount   = timeline.filter(e => e.kind === 'tool' && (e as any).done).length;
  const hasTools    = timeline.some(e => e.kind === 'tool');
  const hasText     = timeline.some(e => e.kind === 'text');

  const verb = hasText ? 'Writing' : hasTools ? 'Working' : 'Thinking';
  const detail = toolSummary || (doneCount > 0 ? `${doneCount} step${doneCount !== 1 ? 's' : ''} done` : '');

  return (
    <Box paddingX={2} marginBottom={1} gap={1}>
      <Text color={dim ? C.textDim : C.brand} dimColor={dim}>⊙</Text>
      <Text color={C.textMuted}>{verb} for</Text>
      <Text color={C.textSecondary}>{elapsed}</Text>
      {detail ? <Text color={C.textDim}>· {detail}</Text> : null}
    </Box>
  );
}

// ── LiveView ──────────────────────────────────────────────────────────────────

interface Props {
  timeline: LiveEvent[];
  busy: boolean;
}

export const LiveView = memo(function LiveView({ timeline, busy }: Props) {
  // Hard ceiling on LiveView height: terminal_rows - (InputBox height + StatusBar
  // height + some slack). This is the "alt-screen lite" solution to keep the
  // prompt on-screen even when the turn has dozens of events. In tall terminals
  // (>30 rows) users see more detail; in short ones we stay compact.
  const termRows = useStdout().stdout?.rows ?? 24;
  const LIVE_CEILING = Math.max(6, termRows - 10);
  const { stdout } = useStdout();
  const [, tick]   = useState(0);

  useEffect(() => {
    if (!busy) return;
    const ticker = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(ticker);
  }, [busy]);

  if (!busy || timeline.length === 0) return null;

  const activeIdx = timeline.findIndex(e => !e.done);
  const stableFull = activeIdx === -1 ? timeline : timeline.slice(0, activeIdx);
  const active = activeIdx === -1 ? [] : timeline.slice(activeIdx);

  // RADICAL FIX: collapse ALL completed steps into a single summary row.
  // Previously we capped "stable" at 10 events, but each thinking/text block
  // could still be 3–5 rows tall, so a long turn still pushed the InputBox
  // off-screen. Now the LiveView is guaranteed to be at most ~6 rows tall:
  //   1. One-line summary of completed steps
  //   2. Any DiffView blocks from completed file edits (kept — too useful
  //      to hide, but each is already self-capped at maxLines)
  //   3. The active event in detail
  // Full activity is still available via Ctrl+R (ScrollView).
  const toolCount = stableFull.filter(e => e.kind === 'tool').length;
  const thinkCount = stableFull.filter(e => e.kind === 'thinking').length;
  const textCount = stableFull.filter(e => e.kind === 'text').length;
  const summaryParts: string[] = [];
  if (toolCount)  summaryParts.push(`${toolCount} tool${toolCount === 1 ? '' : 's'}`);
  if (thinkCount) summaryParts.push(`${thinkCount} think${thinkCount === 1 ? '' : 's'}`);
  if (textCount)  summaryParts.push(`${textCount} text`);
  const stableDiffs = stableFull.filter(e => e.kind === 'tool' && e.diff && e.diff.length > 0) as Array<Extract<LiveEvent, { kind: 'tool' }>>;

  return (
    <Box flexDirection="column" paddingX={2} height={LIVE_CEILING} overflow="hidden">
      {summaryParts.length > 0 && (
        <Box marginBottom={1}>
          <Text color={C.textDim} dimColor>
            ● {stableFull.length} step{stableFull.length === 1 ? '' : 's'} · {summaryParts.join(' · ')}
          </Text>
        </Box>
      )}
      {/* Diffs for completed file edits — too important to collapse, each is
          already capped at maxLines internally. */}
      {stableDiffs.map((ev, idx) => (
        <DiffView
          key={`diff-${idx}`}
          path={ev.path ?? (ev.arg && (() => {
            try { return JSON.parse(ev.arg).path ?? ev.arg; } catch { return ev.arg; }
          })()) ?? ''}
          diff={ev.diff!}
          stats={ev.diffStats}
        />
      ))}

      {/* Group consecutive tool events into a single bordered box — each turn's
          burst of tool calls renders as one panel. Thinking and text events
          break the group so they render in their own blocks above/below. */}
      {(() => {
        const nodes: React.ReactNode[] = [];
        let toolRun: Array<Extract<LiveEvent, { kind: 'tool' }>> = [];
        const flushToolRun = (key: string) => {
          if (toolRun.length === 0) return;
          const rows = toolRun;
          toolRun = [];
          nodes.push(
            <Box
              key={key}
              flexDirection="column"
              marginBottom={1}
              borderStyle="round"
              borderColor={C.borderSubtle}
              paddingX={1}
            >
              {rows.map((t, ri) => (
                <Box key={ri} gap={1}>
                  <Text color={C.textSecondary}>{toolSymbol(t.name)}</Text>
                  <Text color={C.textSecondary} bold>{displayLabel(t.name, t.label)}</Text>
                  {t.arg ? <Text color={C.textDim}>{prettyToolArg(t.name, t.arg)}</Text> : null}
                  {t.startedAt && <Text color={C.textDim}>{fmtElapsed(t.startedAt)}</Text>}
                </Box>
              ))}
            </Box>
          );
        };

        active.forEach((ev, idx) => {
          if (ev.kind === 'tool') {
            toolRun.push(ev);
            return;
          }
          // Non-tool event — flush the pending tool group first.
          flushToolRun(`tool-group-${idx}`);
          if (ev.kind === 'thinking') {
            const lines = lastThinkLines(ev.text);
            nodes.push(
              <Box key={`active-${idx}`} flexDirection="column" marginBottom={1}>
                <Box gap={1}>
                  <Text color={C.textDim}>∇ thinking</Text>
                </Box>
                {lines.map((line, li) => (
                  <Box key={li} paddingLeft={2}>
                    <Text color={C.textDim} wrap="wrap">{line}</Text>
                  </Box>
                ))}
              </Box>
            );
            return;
          }
          if (ev.kind === 'text') {
            const allLines = renderMd(ev.text).split('\n');
            const windowSize = 12;
            const shownLines = allLines.slice(-windowSize);
            nodes.push(
              <Box key={`active-${idx}`} flexDirection="column" marginTop={1}>
                {shownLines.map((line, li) => (
                  <Text key={li} color={C.textPrimary} wrap="wrap">{line}</Text>
                ))}
              </Box>
            );
            return;
          }
        });
        // Flush any tool group that ended the active list.
        flushToolRun('tool-group-tail');
        return nodes;
      })()}
    </Box>
  );
});
