/** tui/components/ScrollLogic.ts — Scroll calculation utilities */
import type { ChatMsg } from '../constants.js';

/** Count lines after wrapping at terminal width (ANSI strip + wrap) */
export function countWrappedLines(text: string, cols: number): number {
  const width = Math.max(cols - 10, 40); // Account for message prefix
  let lines = 0;
  for (const rawLine of text.split('\n')) {
    const clean = rawLine.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (clean.length === 0) { lines++; continue; }
    lines += Math.max(1, Math.ceil(clean.length / width));
  }
  return Math.max(1, lines);
}

/** Lines estimate for a message (viewport sizing) */
export function estimateMsgLines(msg: ChatMsg, cols: number): number {
  if (msg.role === 'tool') return 1;
  if (msg.isLogo) return 2;
  const content = msg.rendered ?? msg.content ?? '';
  const wrapped = countWrappedLines(content, cols);
  return Math.max(2, Math.min(wrapped + 1, 40));
}

/** Calculate viewport from offset (walks backward) */
export function getViewportOffset(
  messages: ChatMsg[],
  offset: number,
  cols: number,
  termHeight: number
): { start: number; end: number } {
  let lines = 0;
  let start = offset;
  for (let i = offset; i >= 0; i--) {
    const est = estimateMsgLines(messages[i]!, cols);
    if (lines + est > termHeight && i < offset) break;
    lines += est;
    start = i;
  }
  return { start, end: offset };
}