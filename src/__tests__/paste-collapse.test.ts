import { describe, it, expect } from "vitest";
import { detectPaste } from "../tui/ink/components/PasteCollapse.js";

describe("detectPaste", () => {
  it("returns null for small deltas", () => {
    expect(detectPaste("hello", "hello!")).toBeNull();
    expect(detectPaste("a\nb\nc", "a\nb\nc!")).toBeNull();
  });

  it("detects paste by char threshold", () => {
    const prev = "";
    const next = "x".repeat(250);
    const seg = detectPaste(prev, next);
    expect(seg).not.toBeNull();
    expect(seg!.chars).toBe(250);
    expect(seg!.lines).toBe(1);
    expect(seg!.start).toBe(0);
    expect(seg!.end).toBe(250);
  });

  it("detects paste by line threshold", () => {
    const prev = "line0";
    const next = "line0\n1\n2\n3\n4";
    const seg = detectPaste(prev, next);
    expect(seg).not.toBeNull();
    expect(seg!.lines).toBeGreaterThanOrEqual(4);
  });

  it("finds correct insertion point (append at end)", () => {
    const prev = "hello\nworld";
    const next = "hello\nworld\nx\n".repeat(100);
    const seg = detectPaste(prev, next);
    expect(seg).not.toBeNull();
    expect(seg!.start).toBe("hello\nworld".length); // after existing text
  });

  it("finds correct insertion point (prepend at start)", () => {
    const prev = "existing text";
    const next = "x\n".repeat(150) + "existing text";
    const seg = detectPaste(prev, next);
    expect(seg).not.toBeNull();
    expect(seg!.end).toBe(next.length - "existing text".length);
  });

  it("detects paste in middle", () => {
    const prev = "start | end";
    const next = "start | " + "MID\n".repeat(20) + "end";
    const seg = detectPaste(prev, next);
    expect(seg).not.toBeNull();
  });

  it("returns null for single-char delta (below 200-char threshold)", () => {
    // 1 char added — below PASTE_CHAR_THRESHOLD (200) and line threshold (4)
    const seg = detectPaste("hello", "hello!");
    expect(seg).toBeNull();
  });

  it("returns correct line count for multi-line paste", () => {
    const lines = 10;
    const text = Array.from({ length: lines }, (_, i) => `line ${i}`).join("\n");
    const seg = detectPaste("", text);
    expect(seg).not.toBeNull();
    expect(seg!.lines).toBe(lines);
  });

  it("handles empty prev (initial paste into empty buffer)", () => {
    const text = "line1\nline2\nline3\nline4\n";
    const seg = detectPaste("", text);
    expect(seg).not.toBeNull();
    expect(seg!.start).toBe(0);
    expect(seg!.end).toBe(text.length);
  });

  it("detects second chunk of a multi-tick paste correctly", () => {
    // Simulate chunk 1: 100 lines
    const chunk1 = "line".repeat(50) + "\n".repeat(99);
    const seg1 = detectPaste("", chunk1);
    expect(seg1).not.toBeNull();

    // Simulate chunk 2 appended: additional 100 lines
    const chunk2 = chunk1 + "\n".repeat(100);
    const seg2 = detectPaste(chunk1, chunk2);
    expect(seg2).not.toBeNull();
    // The second segment represents the delta between chunks, not the full paste.
    // Merging is handled by InputBox; this test ensures detectPaste returns
    // correct delta-segment positions so the merge can work correctly.
    expect(seg2!.start).toBe(chunk1.length);
  });

  it("detectPaste segments can be merged for multi-chunk paste", () => {
    const prev = "";
    const chunk1 = "A".repeat(60);
    const chunk2 = chunk1 + "B".repeat(60);

    const seg1 = detectPaste(prev, chunk1)!;
    const seg2 = detectPaste(chunk1, chunk2)!;

    // Merge: second chunk extends the first
    const merged = {
      start: seg1.start,
      end: Math.max(seg1.end, seg2.end),
      lines: seg1.lines + seg2.lines,
      chars: seg1.chars + seg2.chars,
    };

    expect(merged.start).toBe(0);
    expect(merged.chars).toBe(120);
    // The full text between merged.start and merged.end should match chunk2
    expect(chunk2.slice(merged.start, merged.end).length).toBe(merged.chars);
  });
});
