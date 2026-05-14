import { describe, it, expect, beforeEach } from "vitest";
import { StableLoopGuard } from "../loop-guard.js";
import { LoopDetector } from "../loop-guard.js";

function makeCall(name: string, input: unknown = {}): import('../../kernel/types.js').ToolCall {
  return { id: 'c1', name, input };
}
function makeResult(isError: boolean, content: string = ''): import('../../kernel/types.js').ToolResult {
  return isError
    ? { isError: true, ok: false, content, error: { kind: 'refusal', message: content, retryable: false, fatal_to_loop: false } }
    : { isError: false, ok: true, content, value: undefined };
}
function makeMessage(content: string): import('../../kernel/types.js').Message {
  return { role: 'assistant', content };
}

describe("StableLoopGuard", () => {
  let guard: StableLoopGuard;

  beforeEach(() => {
    guard = new StableLoopGuard();
  });

  // T01: fresh guard not in loop
  it("T01 fresh_guard_not_in_loop", () => {
    expect(guard.isLoopDetected()).toBe(false);
  });

  // T02: same tool same args 5 times triggers loop
  it("T02 same_tool_same_args_5_times_triggers_loop", () => {
    for (let i = 0; i < 5; i++) {
      guard.observe("my_tool", { x: 1, y: 2 });
    }
    expect(guard.isLoopDetected()).toBe(true);
    expect(guard.reason()).toMatch(/repeated_tool_call/);
  });

  // T03: same tool different args under threshold
  it("T03 same_tool_different_args_under_threshold", () => {
    // 4 calls with different inputs
    guard.observe("my_tool", { a: 1 });
    guard.observe("my_tool", { a: 2 });
    guard.observe("my_tool", { a: 3 });
    guard.observe("my_tool", { a: 4 });
    expect(guard.isLoopDetected()).toBe(false);
  });

  // T04: reshuffled key order counts as same
  it("T04 reshuffled_key_order_counts_as_same", () => {
    guard.observe("my_tool", { a: 1, b: 2 });
    guard.observe("my_tool", { b: 2, a: 1 }); // same after stable stringify
    // After 2 calls, not yet threshold (default 5)
    expect(guard.isLoopDetected()).toBe(false);
    // Continue to 5 calls (3 more with either ordering)
    guard.observe("my_tool", { a: 1, b: 2 });
    guard.observe("my_tool", { b: 2, a: 1 });
    guard.observe("my_tool", { a: 1, b: 2 });
    expect(guard.isLoopDetected()).toBe(true);
  });

  // T05: isError increments refusal counter
  it("T05 isError_increments_refusal_counter", () => {
    guard.observe(makeCall('my_tool', { x: 1 }), makeResult(true, 'refused'));
    expect(guard.isLoopDetected()).toBe(false);
    guard.observe(makeCall('my_tool', { x: 1 }), makeResult(true, 'refused'));
    expect(guard.isLoopDetected()).toBe(true);
    expect(guard.reason()).toMatch(/repeated_refusal|repeated_content/);
  });

  // T06: ok result does not increment refusal
  it("T06 ok_result_does_not_increment_refusal", () => {
    guard.observe(makeCall('my_tool', { x: 1 }), makeResult(false, 'ok'));
    guard.observe(makeCall('my_tool', { x: 1 }), makeResult(false, 'ok'));
    expect(guard.isLoopDetected()).toBe(false);
    expect(guard.reason()).toBeNull();
  });

  // T07: content prefix repeats trigger content loop
  it("T07 content_prefix_repeats_trigger_content_loop", () => {
    guard.observe(makeCall('my_tool', { x: 1 }), makeResult(true, 'hello world'));
    expect(guard.isLoopDetected()).toBe(false);
    guard.observe(makeCall('my_tool', { x: 1 }), makeResult(true, 'hello world'));
    expect(guard.isLoopDetected()).toBe(true);
    expect(guard.reason()).toMatch(/repeated_refusal|repeated_content/);
  });

  // T08: output stagnation
  it("T08 output_stagnation", () => {
    guard.observeMessage(makeMessage('same'));
    expect(guard.isLoopDetected()).toBe(false);
    guard.observeMessage(makeMessage('same'));
    expect(guard.isLoopDetected()).toBe(false);
    guard.observeMessage(makeMessage('same'));
    expect(guard.isLoopDetected()).toBe(true);
    expect(guard.reason()).toMatch(/output_stagnation/);
  });

  // T09: output stagnation resets on change
  it("T09 output_stagnation_resets_on_change", () => {
    guard.observeMessage("abc");
    guard.observeMessage("abc");
    guard.observeMessage("def"); // different content resets
    // Now stagnation counter is back to 0, so 3 more same messages
    guard.observeMessage("ghi");
    guard.observeMessage("ghi");
    guard.observeMessage("ghi");
    expect(guard.isLoopDetected()).toBe(true);
    expect(guard.reason()).toMatch(/output_stagnation/);
  });

  // T10: reset clears all state
  it("T10 reset_clears_all_state", () => {
    for (let i = 0; i < 5; i++) {
      guard.observe("my_tool", { x: 1 });
    }
    expect(guard.isLoopDetected()).toBe(true);
    guard.reset();
    expect(guard.isLoopDetected()).toBe(false);
    expect(guard.reason()).toBeNull();
    // After reset, tool call history is empty
    guard.observe("my_tool", { x: 1 });
    expect(guard.isLoopDetected()).toBe(false);
  });

  // T11: reason null when not in loop
  it("T11 reason_null_when_not_in_loop", () => {
    expect(guard.reason()).toBeNull();
  });

  // T12: reason persists to first match
  it("T12 reason_persists_to_first_match", () => {
    for (let i = 0; i < 5; i++) {
      guard.observe(makeCall('my_tool', { x: 1 }), makeResult(true, 'err'));
    }
    expect(guard.isLoopDetected()).toBe(true);
    const r1 = guard.reason();
    const r2 = guard.reason();
    expect(r1).toBe(r2);
    expect(r1).toMatch(/repeated_tool_call/);
  });

  // T13: config override lowers threshold
  it("T13 config_override_lowers_threshold", () => {
    const cheapGuard = new StableLoopGuard({ maxRepeatedToolCalls: 2 });
    cheapGuard.observe("my_tool", { x: 1 });
    expect(cheapGuard.isLoopDetected()).toBe(false);
    cheapGuard.observe("my_tool", { x: 1 });
    expect(cheapGuard.isLoopDetected()).toBe(true);
    expect(cheapGuard.reason()).toMatch(/repeated_tool_call/);
  });

  // T14: legacy LoopDetector alias exists and is same class
  it("T14 legacy_loopdetector_alias_exists", () => {
    expect(StableLoopGuard).toBe(LoopDetector);
  });
});
