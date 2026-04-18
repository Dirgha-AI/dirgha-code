/** tools/patch.ts — Fuzzy file patching: 5-strategy cascade for edit_file */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolResult } from '../types.js';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const stripLines = (s: string) => s.split('\n').map(l => l.trim()).join('\n');

function lev(a: string, b: string): number {
  if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++)
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function fuzzySubstr(hay: string, needle: string, maxD: number): [number, number] | null {
  const nL = needle.length, step = Math.max(1, Math.floor(nL / 20));
  let best: { s: number; e: number; d: number } | null = null;
  for (let i = 0; i <= hay.length - nL; i += step)
    for (const len of [nL, nL - 1, nL + 1, nL - 2, nL + 2]) {
      if (i + len > hay.length || len <= 0) continue;
      const d = lev(needle, hay.slice(i, i + len));
      if (d <= maxD && (!best || d < best.d)) best = { s: i, e: i + len, d };
    }
  if (best) for (let i = Math.max(0, best.s - step); i <= Math.min(hay.length - nL, best.s + step); i++) {
    const d = lev(needle, hay.slice(i, i + nL));
    if (d < best.d) best = { s: i, e: i + nL, d };
  }
  return best ? [best.s, best.e] : null;
}

function blockMatch(lines: string[], old: string, fn: (s: string) => string): string | null {
  const target = fn(old);
  const oldLineCount = old.split('\n').length;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j <= Math.min(lines.length, i + oldLineCount + 2); j++) {
      const block = lines.slice(i, j).join('\n');
      if (fn(block) === target) return block;
    }
  }
  return null;
}

const ok = (abs: string, strategy: string): ToolResult =>
  ({ tool: 'edit_file', result: `Replaced via ${strategy} in ${abs}` });

export function fuzzyEditFileTool(input: Record<string, any>): ToolResult {
  try {
    const abs = resolve(input['path'] as string);
    const original = readFileSync(abs, 'utf8');
    const oldStr = input['old_string'] as string, newStr = input['new_string'] as string;

    // 1: exact
    if (original.includes(oldStr)) {
      writeFileSync(abs, original.replace(oldStr, newStr), 'utf8');
      return ok(abs, 'exact match');
    }
    const lines = original.split('\n');

    // 2: whitespace-normalized
    const wsBlock = blockMatch(lines, oldStr, normalize);
    if (wsBlock) { writeFileSync(abs, original.replace(wsBlock, newStr), 'utf8'); return ok(abs, 'whitespace-normalized match'); }

    // 3: indent-stripped
    const stripBlock = blockMatch(lines, oldStr, stripLines);
    if (stripBlock) { writeFileSync(abs, original.replace(stripBlock, newStr), 'utf8'); return ok(abs, 'indent-stripped match'); }

    // 4: Levenshtein substring
    const maxDist = Math.max(1, Math.floor(oldStr.length * 0.15));
    const fm = fuzzySubstr(original, oldStr, maxDist);
    if (fm) { writeFileSync(abs, original.slice(0, fm[0]) + newStr + original.slice(fm[1]), 'utf8'); return ok(abs, 'lev fuzzy match'); }

    // 5: line-anchored (first + last line)
    const oldLines = oldStr.split('\n');
    if (oldLines.length >= 2) {
      const first = oldLines[0].trim(), last = oldLines[oldLines.length - 1].trim();
      const si = lines.findIndex(l => l.trim() === first);
      if (si >= 0) {
        for (let ei = si + oldLines.length - 1; ei < Math.min(lines.length, si + oldLines.length + 3); ei++) {
          if (lines[ei].trim() === last) {
            const block = lines.slice(si, ei + 1).join('\n');
            writeFileSync(abs, original.replace(block, newStr), 'utf8');
            return ok(abs, 'line-anchored fuzzy match');
          }
        }
      }
    }

    return { tool: 'edit_file', result: '', error: 'old_string not found (all 5 fuzzy strategies exhausted)' };
  } catch (e) { return { tool: 'edit_file', result: '', error: (e as Error).message }; }
}
