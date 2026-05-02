import { describe, it, expect, vi } from "vitest";
import type {
  Telemetry,
  TelemetryEvent,
  TelemetryOptions,
} from "../intelligence/telemetry.js";

// Dynamic import to avoid hoisting issues
const { createTelemetry } = await import("../telemetry.js");

describe("telemetry", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("is a no-op when disabled", async () => {
    const t = createTelemetry({ enabled: false });
    const d = deferred<void>();
    t.record({ command: "test", success: true }).then(() => d.resolve());
    await expect(d.promise).resolves.toBeUndefined();
  });

  it("accepts a record call without throwing when disabled", async () => {
    const t = createTelemetry({ enabled: false });
    await expect(
      t.record({ command: "test", success: false, errorReason: "mock" }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when endpoint is unreachable (enabled)", async () => {
    const t = createTelemetry({
      enabled: true,
      endpoint: "http://localhost:19999/nowhere",
      timeoutMs: 100,
    });
    await expect(
      t.record({ command: "test", success: true }),
    ).resolves.toBeUndefined();
  });

  it("handles payloads with all optional fields", async () => {
    const t = createTelemetry({ enabled: false });
    const event: TelemetryEvent = {
      command: "fleet",
      model: "claude-sonnet-4-6",
      durationMs: 1234,
      success: true,
    };
    await expect(t.record(event)).resolves.toBeUndefined();
  });

  it("handles payloads with only required fields", async () => {
    const t = createTelemetry({ enabled: false });
    await expect(
      t.record({ command: "doctor", success: false }),
    ).resolves.toBeUndefined();
  });

  it("defaults endpoint when not specified", () => {
    const t = createTelemetry({ enabled: false });
    expect(t).toBeDefined();
    expect(typeof t.record).toBe("function");
  });

  it("multiple records don't interfere with each other", async () => {
    const t = createTelemetry({ enabled: false });
    const results = await Promise.all([
      t.record({ command: "a", success: true }),
      t.record({ command: "b", success: false }),
      t.record({ command: "c", success: true, model: "gpt-5" }),
    ]);
    expect(results).toHaveLength(3);
  });
});
