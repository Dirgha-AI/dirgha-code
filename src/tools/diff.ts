/**
 * Unified diff helper used by fs-edit and the TUI's approval modal.
 *
 * Produces a line-oriented unified diff plus optional word-level inline
 * deltas for display. The algorithm is a straightforward longest-common-
 * subsequence walk; it is not minimised for very large files. Callers
 * should cap inputs at ~200 KB to keep latency interactive.
 */

export interface UnifiedDiffOptions {
  context?: number;
  fromLabel?: string;
  toLabel?: string;
}

export function unifiedDiff(before: string, after: string, opts: UnifiedDiffOptions = {}): string {
  const ctx = opts.context ?? 3;
  const a = before.split('\n');
  const b = after.split('\n');
  const ops = lcsOps(a, b);

  const header = [
    `--- ${opts.fromLabel ?? 'before'}`,
    `+++ ${opts.toLabel ?? 'after'}`,
  ];
  const hunks: string[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].kind === 'eq') { i++; continue; }
    let start = i;
    while (start > 0 && ops[start - 1].kind === 'eq' && i - start < ctx) start--;
    let end = i;
    while (end < ops.length && (ops[end].kind !== 'eq' || end - i < ctx)) end++;
    while (end < ops.length && ops[end].kind === 'eq' && end - i < ctx * 2) end++;

    let aCount = 0;
    let bCount = 0;
    const lines: string[] = [];
    let aStart = -1;
    let bStart = -1;
    for (let k = start; k < end; k++) {
      const op = ops[k];
      if (aStart < 0 && op.aLine !== undefined) aStart = op.aLine;
      if (bStart < 0 && op.bLine !== undefined) bStart = op.bLine;
      if (op.kind === 'eq') {
        lines.push(` ${op.text}`);
        aCount++;
        bCount++;
      } else if (op.kind === 'del') {
        lines.push(`-${op.text}`);
        aCount++;
      } else {
        lines.push(`+${op.text}`);
        bCount++;
      }
    }
    hunks.push(`@@ -${(aStart < 0 ? 0 : aStart + 1)},${aCount} +${(bStart < 0 ? 0 : bStart + 1)},${bCount} @@`);
    hunks.push(...lines);
    i = end;
  }

  if (hunks.length === 0) return '';
  return [...header, ...hunks].join('\n');
}

type Op =
  | { kind: 'eq'; text: string; aLine: number; bLine: number }
  | { kind: 'del'; text: string; aLine: number; bLine?: number }
  | { kind: 'add'; text: string; bLine: number; aLine?: number };

function lcsOps(a: string[], b: string[]): Op[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: 'eq', text: a[i], aLine: i, bLine: j });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i], aLine: i });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j], bLine: j });
      j++;
    }
  }
  while (i < m) { out.push({ kind: 'del', text: a[i], aLine: i }); i++; }
  while (j < n) { out.push({ kind: 'add', text: b[j], bLine: j }); j++; }
  return out;
}

export function summariseDiff(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { added, removed };
}
