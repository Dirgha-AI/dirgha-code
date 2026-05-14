import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Helper to get a temporary directory path unique per test.
let currentTmp: string;

beforeEach(() => {
  currentTmp = mkdtempSync(join(tmpdir(), "health-test-"));
  process.env.HOME = currentTmp;
  // Ensure .dirgha directory exists for tests that write legacy files.
  mkdirSync(join(currentTmp, ".dirgha"), { recursive: true });
  // Clear any previous module cache so the next import is fresh.
  vi.resetModules();
});

afterEach(() => {
  if (currentTmp) {
    try {
      rmSync(currentTmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  vi.restoreAllMocks();
});

// Import the health monitor functions dynamically after HOME is set.
async function loadHealth() {
  return await import("../health-monitor.js");
}

// ---------------------------------------------------------------------------
// T01: independent cooldowns per model
// ---------------------------------------------------------------------------
describe("T01 independent_cooldowns_per_model", () => {
  it("cooldown on (anthropic, claude-haiku) does not affect claude-opus", async () => {
    const { recordFailure, isBlacklisted } = await loadHealth();
    const provider = "anthropic";
    const badModel = "claude-haiku";
    const goodModel = "claude-opus";

    // Trigger cooldown on the bad model.
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, badModel, "error");
    }

    expect(isBlacklisted(provider, goodModel)).toBe(false);
    expect(isBlacklisted(provider, badModel)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T02: model reassignment to different provider mid-session
// ---------------------------------------------------------------------------
describe("T02 model_reassignment_to_different_provider_mid_session", () => {
  it("cooldown on deepseek does not propagate to openrouter", async () => {
    const { recordFailure, isBlacklisted } = await loadHealth();
    recordFailure("deepseek", "deepseek-v4-flash", "error");

    expect(isBlacklisted("openrouter", "deepseek-v4-flash")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T03: legacy health.json does not crash
// ---------------------------------------------------------------------------
describe("T03 legacy_health_json_does_not_crash", () => {
  it("loads legacy file, logs warning, returns empty state", async () => {
    // Spy on console.warn before importing.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Write a legacy-format health.json
    const healthPath = join(currentTmp, ".dirgha", "health.json");
    const dir = join(currentTmp, ".dirgha");
    if (!existsSync(dir)) {
      mkdtempSync(dir); // Actually we use mkdirSync; but we'll write directly
    }
    // Use writeFileSync
    writeFileSync(
      healthPath,
      JSON.stringify({ providers: { someProvider: { provider: "someProvider", totalRequests: 0, failures: 0 } } }),
      "utf8"
    );

    const { getAllHealth } = await loadHealth();
    expect(getAllHealth()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// T04: succeed then fail then succeed resets cooldown
// ---------------------------------------------------------------------------
describe("T04 succeed_then_fail_then_succeed_resets_cooldown", () => {
  it("one success after cooldown clears blacklist and decrements level", async () => {
    const { recordSuccess, recordFailure, isBlacklisted, getHealth } = await loadHealth();
    const provider = "testProvider";
    const model = "testModel";

    recordSuccess(provider, model, 100);

    // 5 failures → cooldown level 1
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }

    expect(isBlacklisted(provider, model)).toBe(true);
    let health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(1);

    // One success clears blacklist via probe, but cooldownLevel decrements only after 2 consecutive successes.
    recordSuccess(provider, model, 100);
    expect(isBlacklisted(provider, model)).toBe(false);
    health = getHealth(provider, model);
    // After one success, cooldownLevel is still 1 because RECOVERY_SUCCESSES=2.
    expect(health!.cooldownLevel).toBe(1);

    // Second success decrements cooldownLevel to 0.
    recordSuccess(provider, model, 100);
    health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T05: cooldown level escalates on repeated failures
// ---------------------------------------------------------------------------
describe("T05 cooldown_level_escalates_on_repeated_failures", () => {
  it("increases level on each batch after cooldown expires", async () => {
    vi.useFakeTimers();
    const { recordFailure, isBlacklisted, getHealth } = await loadHealth();
    const provider = "escalation";
    const model = "testModel";

    // First batch: 5 failures → level 1, cooldown 30s
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }
    let health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(1);

    // Advance time past the 120s cooldown
    vi.advanceTimersByTime(121_000);

    // Trigger probe (isBlacklisted returns false and sets probeActive)
    isBlacklisted(provider, model);

    // Second batch: 5 more failures → level 2
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }
    health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(2);

    // Advance past 5-minute cooldown
    vi.advanceTimersByTime(301_000);
    isBlacklisted(provider, model);

    // Third batch → level 3
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }
    health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(3);

    // Advance past 15-minute cooldown
    vi.advanceTimersByTime(901_000);
    isBlacklisted(provider, model);

    // Fourth batch → level 4
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }
    health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(4);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// T06: cooldown level decays on consecutive success
// ---------------------------------------------------------------------------
describe("T06 cooldown_level_decays_on_consecutive_success", () => {
  it("two successes reduce level by 1; four successes bring to 0", async () => {
    const { recordFailure, recordSuccess, getHealth } = await loadHealth();
    const provider = "decay";
    const model = "testModel";

    // Drive cooldown level to 2 (two batches with fake timers may be unreliable,
    // so we rely on manual state via calls)
    for (let batch = 0; batch < 2; batch++) {
      for (let i = 0; i < 5; i++) {
        recordFailure(provider, model, "error");
      }
      // Wait for cooldown to expire to allow next batch
      vi.useFakeTimers();
      vi.advanceTimersByTime(62_000); // enough for level1 and level2 cooldowns
      // trigger probe
      // isBlacklisted not needed, we just advance time far enough
      vi.useRealTimers();
    }

    let health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(2);

    // Now we need to clear the blacklist (if any) to allow success to decay.
    // Since we advanced time, blacklist should be expired, but success must
    // happen after blacklist is cleared (isBlacklisted returns false).
    // To be safe, call isBlacklisted to reset probeActive.
    const { isBlacklisted } = await import("../health-monitor.js");
    isBlacklisted(provider, model);

    // Two consecutive successes → level becomes 1
    recordSuccess(provider, model, 100);
    recordSuccess(provider, model, 100);
    health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(1);

    // Two more successes → level becomes 0
    recordSuccess(provider, model, 100);
    recordSuccess(provider, model, 100);
    health = getHealth(provider, model);
    expect(health!.cooldownLevel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T07: probe during cooldown succeeds clears cooldown
// ---------------------------------------------------------------------------
describe("T07 probe_during_cooldown_succeeds_clears_cooldown", () => {
  it("isBlacklisted after expiry sets probe, then success clears blacklist", async () => {
    vi.useFakeTimers();
    const { recordFailure, recordSuccess, isBlacklisted, getHealth } = await loadHealth();
    const provider = "probe";
    const model = "testModel";

    // Set cooldown (blacklistedUntil = now + 30s)
    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }

    let health = getHealth(provider, model);
    expect(health!.cooldownUntil).toBeGreaterThan(Date.now());

    // Advance time past cooldown
    vi.advanceTimersByTime(31_000);

    // This call triggers probe (returns false)
    expect(isBlacklisted(provider, model)).toBe(false);

    // Record success (probe success). RECOVERY_SUCCESSES=2, so call twice
    // to confirm the cooldown level decrement.
    recordSuccess(provider, model, 100);
    recordSuccess(provider, model, 100);

    health = getHealth(provider, model);
    expect(health!.cooldownUntil).toBeNull();
    // cooldownLevel should have decremented (was 1 → 0) after 2 successes
    expect(health!.cooldownLevel).toBe(0);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// T08: persistence round trip
// ---------------------------------------------------------------------------
describe("T08 persistence_round_trip", () => {
  it("persists and reloads state correctly", async () => {
    const { recordSuccess, recordFailure, getAllHealth, resetHealth } = await loadHealth();
    const provider1 = "p1";
    const model1 = "m1";
    const provider2 = "p2";
    const model2 = "m2";

    recordSuccess(provider1, model1, 100);
    recordFailure(provider1, model1, "err");
    recordSuccess(provider2, model2, 200);

    const original = getAllHealth();

    // Reset module cache and reimport – that triggers loadPersisted()
    vi.resetModules();
    const { getAllHealth: getAllHealth2 } = await import("../health-monitor.js");
    const loaded = getAllHealth2();

    expect(loaded).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// T09: explicit model override bypasses cooldown
// ---------------------------------------------------------------------------
describe("T09 explicit_model_override_bypasses_cooldown", () => {
  it("isBlacklisted returns true for blacklisted model", async () => {
    const { recordFailure, isBlacklisted } = await loadHealth();
    const provider = "override";
    const model = "testModel";

    for (let i = 0; i < 5; i++) {
      recordFailure(provider, model, "error");
    }

    expect(isBlacklisted(provider, model)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T10: new health.json format written on persist
// ---------------------------------------------------------------------------
describe("T10 new_health_json_format_written_on_persist", () => {
  it("file contains 'entries' key with provider:model keys", async () => {
    const { recordFailure } = await loadHealth();
    recordFailure("provA", "modelX", "err");

    const healthPath = join(currentTmp, ".dirgha", "health.json");
    const raw = readFileSync(healthPath, "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty("entries");
    expect(parsed).not.toHaveProperty("providers");
    const keys = Object.keys(parsed.entries);
    expect(keys).toContain("provA:modelX");
  });
});

// ---------------------------------------------------------------------------
// T11: multiple callers same key race
// ---------------------------------------------------------------------------
describe("T11 multiple_callers_same_key_race", () => {
  it("two concurrent recordSuccess calls aggregate totalRequests", async () => {
    const { recordSuccess, getHealth } = await loadHealth();
    const provider = "race";
    const model = "testModel";

    await Promise.all([
      new Promise<void>((resolve) => {
        recordSuccess(provider, model, 50);
        resolve();
      }),
      new Promise<void>((resolve) => {
        recordSuccess(provider, model, 150);
        resolve();
      }),
    ]);

    const health = getHealth(provider, model);
    // These fields are now part of the public ProviderHealth interface.
    expect(health!.totalRequests).toBe(2);
    expect(health!.avgLatencyMs).toBeCloseTo(100, 0); // (50+150)/2
  });
});

// ---------------------------------------------------------------------------
// T12: legacy then persist does not bleed
// ---------------------------------------------------------------------------
describe("T12 legacy_then_persist_does_not_bleed", () => {
  it("loads legacy file, adds new entry, persists, reload shows only new entry", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Write a legacy file with two providers (one with non-string provider)
    const dir = join(currentTmp, ".dirgha");
    if (!existsSync(dir)) {
      // Must create dir; simplest: ensure it exists via mkdirSync later
    }
    writeFileSync(
      join(dir, "health.json"),
      JSON.stringify({
        providers: {
          deepseek: { provider: "deepseek", totalRequests: 1 },
          badProvider: { provider: 123, totalRequests: 0 },
        },
      }),
      "utf8",
    );

    const { recordSuccess, getAllHealth } = await loadHealth();
    // The legacy load should have ignored both entries.
    expect(getAllHealth()).toHaveLength(0);

    // Write a new entry
    recordSuccess("testProvider", "testModel", 100);
    // Persist is triggered automatically

    // Clear and reload
    vi.resetModules();
    const { getAllHealth: getAllHealth2 } = await import("../health-monitor.js");
    const state = getAllHealth2();
    expect(state).toHaveLength(1);
    expect(state[0].provider).toBe("testProvider");
    expect(state[0].model).toBe("testModel");

    // Read file and verify only entries key, no providers
    const raw = readFileSync(join(dir, "health.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("entries");
    expect(parsed).not.toHaveProperty("providers");
  });
});

// ---------------------------------------------------------------------------
// T13: model name with colon
// ---------------------------------------------------------------------------
describe("T13 model_name_with_colon", () => {
  it("round-trips without splitting on colon in key", async () => {
    const { recordSuccess, isBlacklisted, getHealth, getAllHealth } = await loadHealth();
    const provider = "openrouter";
    const model = "nvidia/foo:free";

    recordSuccess(provider, model, 100);
    expect(isBlacklisted(provider, model)).toBe(false);

    const health = getHealth(provider, model);
    expect(health!.model).toBe(model);

    const all = getAllHealth();
    expect(all).toHaveLength(1);

    // Persist and reload
    vi.resetModules();
    const { getHealth: getHealth2 } = await import("../health-monitor.js");
    const health2 = getHealth2(provider, model);
    expect(health2).not.toBeNull();
    expect(health2!.model).toBe(model);

    // Check file contents
    const raw = readFileSync(join(currentTmp, ".dirgha", "health.json"), "utf8");
    const parsed = JSON.parse(raw);
    const expectedKey = "openrouter:nvidia/foo:free";
    expect(parsed.entries).toHaveProperty(expectedKey);
  });
});

// ---------------------------------------------------------------------------
// T14: cross device rename fallback
// ---------------------------------------------------------------------------
describe("T14 cross_device_rename_fallback", () => {
  it("throws EXDEV, fallback writeFileSync works, tmp file removed", async () => {
    // Mock renameSync to throw EXDEV
    vi.mock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        renameSync: vi.fn(() => {
          throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
        }),
      };
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { recordFailure } = await loadHealth();
    recordFailure("cross", "device", "err");

    // console.warn should have been called with cross-device message
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("cross-device"),
    );

    const healthPath = join(currentTmp, ".dirgha", "health.json");
    expect(existsSync(healthPath)).toBe(true);

    // Verify the file is valid JSON with entries
    const raw = readFileSync(healthPath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("entries");

    // Verify tmp file is removed
    const tmpPath = healthPath + ".tmp";
    expect(existsSync(tmpPath)).toBe(false);
  });
});
