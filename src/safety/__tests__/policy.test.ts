import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateLokahiGateSync, type LokahiWasmSyncExports } from "../policy.js";

const originalOptOut = process.env.DIRGHA_ALLOW_UNGATED;

afterEach(() => {
  if (originalOptOut === undefined) delete process.env.DIRGHA_ALLOW_UNGATED;
  else process.env.DIRGHA_ALLOW_UNGATED = originalOptOut;
  vi.restoreAllMocks();
});

function fakeWasm(verdict: number): LokahiWasmSyncExports {
  return {
    memory: new WebAssembly.Memory({ initial: 2 }),
    lokahi_c_abi_evaluate_utf8: () => verdict,
  };
}

describe("Lokahi WASM gate fail-closed behavior", () => {
  it("denies when wasm is missing", () => {
    expect(evaluateLokahiGateSync("safe", false, null)).toEqual({
      allowed: false,
      reason: "lokahi_gate_unavailable",
    });
  });

  it("denies when loading or evaluation throws", () => {
    expect(evaluateLokahiGateSync("safe", false, () => { throw new Error("load failed"); })).toEqual({
      allowed: false,
      reason: "lokahi_gate_unavailable",
    });
  });

  it("denies an unknown -1 verdict", () => {
    expect(evaluateLokahiGateSync("safe", false, fakeWasm(-1))).toEqual({
      allowed: false,
      reason: "lokahi_gate_unavailable",
    });
  });

  it("requires the explicit opt-out and emits a loud warning", () => {
    process.env.DIRGHA_ALLOW_UNGATED = "1";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(evaluateLokahiGateSync("safe", false, null)).toEqual({
      allowed: true,
      reason: "lokahi_gate_unavailable_opt_out",
    });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("DIRGHA_ALLOW_UNGATED=1"));
  });
});
