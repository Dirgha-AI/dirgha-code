/**
 * tui/helpers/grapheme.ts — Grapheme-aware string helpers for the input buffer.
 *
 * Motivation (Kimi parity audit — Gap 2): naive string indexing is wrong for
 * emoji ("👨‍👩‍👧" is ONE grapheme spanning multiple code points), combining
 * marks ("é" may be "e" + U+0301), and regional-indicator flags ("🇺🇸").
 * Backspace on any of these previously deleted half the grapheme, leaving a
 * mojibake trail. Intl.Segmenter is built into modern V8 and needs no deps.
 */

// Singleton segmenter — constructing one is ~200µs, cheap to reuse.
let _seg: Intl.Segmenter | null = null;
const seg = (): Intl.Segmenter => (_seg ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' }));

// LRU for grapheme-stop arrays. Keys are strings; keep small so typing into a
// growing buffer doesn't retain every intermediate state forever.
const STOP_CACHE_MAX = 32;
const stopCache = new Map<string, number[]>();

/** All grapheme-boundary offsets in s, including 0 and s.length. */
export function graphemeStops(s: string): number[] {
  const hit = stopCache.get(s);
  if (hit) return hit;
  const stops: number[] = [0];
  for (const { index } of seg().segment(s)) {
    if (index > 0) stops.push(index);
  }
  if (stops[stops.length - 1] !== s.length) stops.push(s.length);
  stopCache.set(s, stops);
  if (stopCache.size > STOP_CACHE_MAX) {
    const oldest = stopCache.keys().next().value;
    if (oldest !== undefined) stopCache.delete(oldest);
  }
  return stops;
}

/** Snap p to the nearest valid grapheme boundary at or before p. */
export function snapPos(s: string, p: number): number {
  if (p <= 0) return 0;
  if (p >= s.length) return s.length;
  const stops = graphemeStops(s);
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i]! <= p) return stops[i]!;
  }
  return 0;
}

/** Previous grapheme boundary strictly before p. */
export function prevPos(s: string, p: number): number {
  if (p <= 0) return 0;
  const stops = graphemeStops(s);
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i]! < p) return stops[i]!;
  }
  return 0;
}

/** Next grapheme boundary strictly after p. */
export function nextPos(s: string, p: number): number {
  if (p >= s.length) return s.length;
  const stops = graphemeStops(s);
  for (let i = 0; i < stops.length; i++) {
    if (stops[i]! > p) return stops[i]!;
  }
  return s.length;
}

// Unicode-aware word char: letters + numbers + underscore.
const WORD_RE = /[\p{L}\p{N}_]/u;

/** Start of previous word from p. Skips whitespace first, then scans back. */
export function wordLeft(s: string, p: number): number {
  if (p <= 0) return 0;
  let i = Math.min(p, s.length);
  // skip whitespace to the left
  while (i > 0 && /\s/.test(s[i - 1]!)) i--;
  // skip word chars to the left
  while (i > 0 && WORD_RE.test(s[i - 1]!)) i--;
  return i;
}

/** End of next word from p. Skips whitespace first, then scans forward. */
export function wordRight(s: string, p: number): number {
  if (p >= s.length) return s.length;
  let i = Math.max(0, p);
  while (i < s.length && /\s/.test(s[i]!)) i++;
  while (i < s.length && WORD_RE.test(s[i]!)) i++;
  return i;
}

/** Delete the grapheme immediately before p; return new [string, newCursor]. */
export function deleteGraphemeBefore(s: string, p: number): [string, number] {
  if (p <= 0) return [s, 0];
  const start = prevPos(s, p);
  return [s.slice(0, start) + s.slice(p), start];
}

/** Delete the grapheme starting at p; return new [string, newCursor]. */
export function deleteGraphemeAt(s: string, p: number): [string, number] {
  if (p >= s.length) return [s, p];
  const end = nextPos(s, p);
  return [s.slice(0, p) + s.slice(end), p];
}

/** Count of graphemes in s — useful for display-width calculations. */
export function graphemeCount(s: string): number {
  return graphemeStops(s).length - 1;
}
