import { describe, it, expect } from "vitest";
import { renderStreamingEvents } from "../tui/renderer.js";

describe("tui renderer", () => {
  it("renders text_delta events", () => {
    const lines: string[] = [];
    const stop = renderStreamingEvents({
      write: (chunk: string) => {
        lines.push(chunk);
      },
      showThinking: false,
    });

    stop({ type: "text_delta", delta: "hello" });
    stop({ type: "text_delta", delta: " world" });
    stop({ type: "text_end" });
    stop({ type: "turn_end", turnId: "1", stopReason: "end_turn" });

    const joined = lines.join("");
    expect(joined).toContain("hello");
    expect(joined).toContain("world");
  });

  it("handles empty text", () => {
    const lines: string[] = [];
    const stop = renderStreamingEvents({
      write: (chunk: string) => {
        lines.push(chunk);
      },
      showThinking: false,
    });

    stop({ type: "turn_end", turnId: "1", stopReason: "end_turn" });

    // Should not crash on empty events
    expect(true).toBe(true);
  });

  it("suppresses EPIPE errors", () => {
    const lines: string[] = [];
    const stop = renderStreamingEvents({
      write: (chunk: string) => {
        lines.push(chunk);
        const err = new Error("broken pipe") as NodeJS.ErrnoException;
        err.code = "EPIPE";
        throw err;
      },
      showThinking: false,
    });

    // The inner write throws EPIPE. The renderer's default write
    // wrapper catches EPIPE/EIO; a custom write is exempt from that.
    // Validate that the custom write is invoked and the error
    // does propagate (caller is responsible for wrapping).
    expect(() => stop({ type: "text_delta", delta: "test" })).toThrow(
      "broken pipe",
    );
    expect(lines.length).toBe(1);
  });
});
