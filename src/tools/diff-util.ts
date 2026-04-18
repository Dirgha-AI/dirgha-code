/**
 * tools/diff-util.ts — Compute structured line-level diff for TUI rendering.
 *
 * Uses `diff.diffLines` to produce hunks, then trims them to a window of
 * context around actual changes so we don't dump a 2,000-line file to the
 * terminal for a 3-line edit.
 */

import { diffLines } from 'diff';
import type { DiffLine } from '../types.js';

const CONTEXT_LINES = 3;

export function computeLineDiff(oldContent: string, newContent: string): { diff: DiffLine[]; added: number; removed: number } {
  if (oldContent === newContent) {
    return { diff: [], added: 0, removed: 0 };
  }

  const changes = diffLines(oldContent, newContent);

  // Walk changes and build a numbered diff stream.
  const all: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;
  for (const c of changes) {
    const lines = c.value.replace(/\n$/, '').split('\n');
    if (c.added) {
      for (const t of lines) all.push({ kind: '+', newNum: newNum++, text: t });
    } else if (c.removed) {
      for (const t of lines) all.push({ kind: '-', oldNum: oldNum++, text: t });
    } else {
      for (const t of lines) { all.push({ kind: ' ', oldNum: oldNum++, newNum: newNum++, text: t }); }
    }
  }

  // Collapse long runs of context into ±CONTEXT_LINES around each change,
  // with a `…` marker line when trimmed.
  const keep: boolean[] = all.map(l => l.kind !== ' ');
  for (let i = 0; i < all.length; i++) {
    if (all[i]!.kind !== ' ') continue;
    // keep context lines near any change
    for (let d = 1; d <= CONTEXT_LINES; d++) {
      if (all[i - d] && all[i - d]!.kind !== ' ') { keep[i] = true; break; }
      if (all[i + d] && all[i + d]!.kind !== ' ') { keep[i] = true; break; }
    }
  }

  const out: DiffLine[] = [];
  let trimming = false;
  for (let i = 0; i < all.length; i++) {
    if (keep[i]) {
      if (trimming) { out.push({ kind: ' ', text: '…' }); trimming = false; }
      out.push(all[i]!);
    } else {
      trimming = true;
    }
  }

  const added = all.filter(l => l.kind === '+').length;
  const removed = all.filter(l => l.kind === '-').length;
  return { diff: out, added, removed };
}
