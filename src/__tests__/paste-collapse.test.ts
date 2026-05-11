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

  it("returns null when change is below both thresholds", () => {
    // 4 chars added — below PASTE_CHAR_THRESHOLD (200) and line threshold (4)
    const seg = detectPaste("aaaa", "bbbb");
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
});
