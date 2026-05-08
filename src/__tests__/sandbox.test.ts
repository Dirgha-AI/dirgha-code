/**
 * Aggressive sandbox-mode tests.
 *
 * Three angles of coverage:
 *
 *   A. /sandbox slash command — picker text, mode change, persistence,
 *      invalid input.
 *   B. Shell tool routing — when sandboxMode is "auto"/"strict", the
 *      tool MUST route through the platform sandbox adapter; when
 *      "off" it MUST spawn directly. Tested via a mock adapter that
 *      records every call so we know the right path was taken.
 *   C. Edge cases — adapter unavailable, sandbox throws, mode toggles
 *      mid-session, concurrent invocations, malformed mode, default
 *      fallback for missing config.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sandboxCommand } from "../cli/slash/sandbox.js";
import { shellTool } from "../tools/shell.js";
import type { SlashContext } from "../cli/slash.js";
import type {
  SandboxAdapter,
  SandboxExecOptions,
  SandboxResult,
} from "../safety/sandbox/iface.js";
import type { ToolContext, SandboxMode } from "../tools/registry.js";

// ────────────────────────────────────────────────────────────
// Test scaffolding
// ────────────────────────────────────────────────────────────

class RecordingSandbox implements SandboxAdapter {
  readonly platform = "linux-bwrap" as const;
  calls: SandboxExecOptions[] = [];
  available_returns = true;
  exec_returns: SandboxResult = {
    stdout: "OK\n",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    platform: "linux-bwrap",
  };
  exec_throws: Error | null = null;
  async available(): Promise<boolean> {
    return this.available_returns;
  }
  async exec(opts: SandboxExecOptions): Promise<SandboxResult> {
    this.calls.push(opts);
    if (this.exec_throws) throw this.exec_throws;
    return this.exec_returns;
  }
}

function makeCtx(
  sandbox: SandboxAdapter | null,
  sandboxMode: SandboxMode,
  cwd: string,
): ToolContext {
  return {
    cwd,
    env: { PATH: process.env["PATH"] ?? "" },
    sessionId: "test",
    signal: new AbortController().signal,
    sandbox,
    sandboxMode,
  };
}

function makeSlashCtx(
  initial: SandboxMode,
  onSet?: (mode: SandboxMode) => void,
): SlashContext {
  let current = initial;
  return {
    model: "test",
    sessionId: "t",
    setModel: () => undefined,
    showHelp: () => "",
    compact: async () => "",
    clear: () => undefined,
    listSessions: async () => "",
    loadSession: async () => "",
    listSkills: async () => "",
    showCost: () => "",
    exit: () => undefined,
    getToken: () => null,
    setToken: () => undefined,
    apiBase: () => "https://test",
    upgradeUrl: () => "https://test",
    status: () => undefined,
    requestKey: () => undefined,
    getMode: () => "act",
    setMode: () => undefined,
    getTheme: () => "readable",
    setTheme: () => undefined,
    getSandbox: () => current,
    setSandbox: (mode) => {
      current = mode;
      onSet?.(mode);
    },
    getSession: () => null,
    getSessionStore: () => null,
    getProvider: () => null,
    getSummaryModel: () => "test",
  };
}

let originalHome: string | undefined;
let tempHome: string;

beforeEach(async () => {
  // Each test gets a fresh HOME so /sandbox config writes don't bleed.
  tempHome = await mkdtemp(join(tmpdir(), "dirgha-sb-"));
  originalHome = process.env["HOME"];
  process.env["HOME"] = tempHome;
  await mkdir(join(tempHome, ".dirgha"), { recursive: true });
});

afterEach(async () => {
  if (originalHome !== undefined) {
    process.env["HOME"] = originalHome;
  } else {
    delete process.env["HOME"];
  }
  await rm(tempHome, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────
// A. /sandbox slash command
// ────────────────────────────────────────────────────────────

describe("/sandbox slash command", () => {
  test("no args: shows current + all three modes with descriptions", async () => {
    const out = await sandboxCommand.execute([], makeSlashCtx("off"));
    expect(typeof out).toBe("string");
    expect(out).toContain("Current sandbox mode: off");
    expect(out).toContain("off ");
    expect(out).toContain("auto");
    expect(out).toContain("strict");
    expect(out).toContain("/sandbox <mode>");
    expect(out).toContain("fs-read/fs-write/fs-edit/search-glob");
  });

  test("highlights the active mode with a marker", async () => {
    const offOut = await sandboxCommand.execute([], makeSlashCtx("off"));
    const autoOut = await sandboxCommand.execute([], makeSlashCtx("auto"));
    const strictOut = await sandboxCommand.execute([], makeSlashCtx("strict"));
    expect(offOut).toMatch(/▸\s+off/);
    expect(autoOut).toMatch(/▸\s+auto/);
    expect(strictOut).toMatch(/▸\s+strict/);
    // Each output should mark exactly one row as active.
    expect((offOut as string).match(/▸/g)?.length).toBe(1);
    expect((autoOut as string).match(/▸/g)?.length).toBe(1);
    expect((strictOut as string).match(/▸/g)?.length).toBe(1);
  });

  test("setting auto persists to ~/.dirgha/config.json", async () => {
    let captured: SandboxMode | null = null;
    const ctx = makeSlashCtx("off", (m) => {
      captured = m;
    });
    const out = await sandboxCommand.execute(["auto"], ctx);
    expect(out).toContain("auto");
    expect(out).toContain("→ auto");
    expect(captured).toBe("auto");
    const cfgRaw = await readFile(
      join(tempHome, ".dirgha", "config.json"),
      "utf8",
    );
    const cfg = JSON.parse(cfgRaw);
    expect(cfg.sandbox).toBe("auto");
  });

  test("setting strict persists and overwrites a prior config", async () => {
    await writeFile(
      join(tempHome, ".dirgha", "config.json"),
      JSON.stringify({ sandbox: "off", model: "kimi-k2.6" }),
      "utf8",
    );
    await sandboxCommand.execute(["strict"], makeSlashCtx("off"));
    const cfg = JSON.parse(
      await readFile(join(tempHome, ".dirgha", "config.json"), "utf8"),
    );
    expect(cfg.sandbox).toBe("strict");
    // Other keys must be preserved.
    expect(cfg.model).toBe("kimi-k2.6");
  });

  test("invalid mode does not crash and does not write config", async () => {
    const out = await sandboxCommand.execute(["banana"], makeSlashCtx("off"));
    expect(out).toContain('Unknown sandbox mode "banana"');
    expect(out).toContain("Valid: off · auto · strict");
    // Config not created.
    await expect(
      readFile(join(tempHome, ".dirgha", "config.json"), "utf8"),
    ).rejects.toThrow();
  });

  test("empty-string arg is treated as a missing mode (just shows current)", async () => {
    // Slash dispatcher passes [] for empty input — verify we hit the
    // no-args branch, not the validation branch with "" as the value.
    const out = await sandboxCommand.execute([], makeSlashCtx("off"));
    expect(out).not.toContain("Unknown sandbox mode");
  });

  test("idempotent — setting the same mode twice doesn't break", async () => {
    const ctx = makeSlashCtx("off");
    await sandboxCommand.execute(["auto"], ctx);
    const out = await sandboxCommand.execute(["auto"], ctx);
    expect(out).toContain("→ auto");
    const cfg = JSON.parse(
      await readFile(join(tempHome, ".dirgha", "config.json"), "utf8"),
    );
    expect(cfg.sandbox).toBe("auto");
  });

  test("registered name is 'sandbox' with non-empty description", () => {
    expect(sandboxCommand.name).toBe("sandbox");
    expect(sandboxCommand.description.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────
// B. Shell tool routing through the sandbox
// ────────────────────────────────────────────────────────────

describe("shell tool sandbox routing", () => {
  test("mode=off: bypasses sandbox even when adapter is available", async () => {
    const sb = new RecordingSandbox();
    const ctx = makeCtx(sb, "off", process.cwd());
    const result = await shellTool.execute(
      { command: "echo OK" },
      ctx,
    );
    // Direct spawn → sandbox.exec was NOT called.
    expect(sb.calls).toHaveLength(0);
    // Real /bin/sh ran the echo and we got OK back (Unix only).
    if (process.platform !== "win32") {
      expect(result.isError).toBe(false);
    }
  });

  test("mode=auto: routes through sandbox.exec with cwd writable + network allowed", async () => {
    const sb = new RecordingSandbox();
    const ctx = makeCtx(sb, "auto", "/some/cwd");
    const result = await shellTool.execute(
      { command: "echo OK" },
      ctx,
    );
    expect(sb.calls).toHaveLength(1);
    const call = sb.calls[0]!;
    expect(call.cwd).toBe("/some/cwd");
    expect(call.writablePaths).toEqual(["/some/cwd"]);
    expect(call.networkAllowed).toBe(true);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("[sandbox: linux-bwrap/auto]");
    expect(result.content).toContain("OK");
  });

  test("mode=strict: routes through sandbox.exec with network BLOCKED", async () => {
    const sb = new RecordingSandbox();
    const ctx = makeCtx(sb, "strict", "/some/cwd");
    await shellTool.execute({ command: "echo OK" }, ctx);
    expect(sb.calls).toHaveLength(1);
    const call = sb.calls[0]!;
    expect(call.networkAllowed).toBe(false);
    expect(call.writablePaths).toEqual(["/some/cwd"]);
  });

  test("mode=auto but adapter is null: falls back to direct spawn", async () => {
    const ctx = makeCtx(null, "auto", process.cwd());
    const result = await shellTool.execute(
      { command: "echo OK" },
      ctx,
    );
    // No adapter to call — must have spawned directly.
    if (process.platform !== "win32") {
      expect(result.isError).toBe(false);
    }
  });

  test("mode=auto but adapter.available() returns false: falls back to direct spawn", async () => {
    const sb = new RecordingSandbox();
    sb.available_returns = false;
    const ctx = makeCtx(sb, "auto", process.cwd());
    const result = await shellTool.execute(
      { command: "echo OK" },
      ctx,
    );
    // Sandbox was probed but skipped.
    expect(sb.calls).toHaveLength(0);
    if (process.platform !== "win32") {
      expect(result.isError).toBe(false);
    }
  });

  test("mode=auto and adapter.exec throws: returns isError with message", async () => {
    const sb = new RecordingSandbox();
    sb.exec_throws = new Error("bwrap not allowed in this container");
    const ctx = makeCtx(sb, "auto", process.cwd());
    const result = await shellTool.execute(
      { command: "echo OK" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Sandbox exec failed (auto)");
    expect(result.content).toContain("bwrap not allowed");
  });

  test("non-zero exit from sandbox is surfaced as isError", async () => {
    const sb = new RecordingSandbox();
    sb.exec_returns = {
      stdout: "",
      stderr: "no such file\n",
      exitCode: 2,
      timedOut: false,
      platform: "linux-bwrap",
    };
    const ctx = makeCtx(sb, "auto", "/some/cwd");
    const result = await shellTool.execute(
      { command: "ls /nonexistent" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Exit: 2");
    expect(result.content).toContain("STDERR");
    expect(result.content).toContain("no such file");
  });

  test("timedOut sandbox result annotates the exit line", async () => {
    const sb = new RecordingSandbox();
    sb.exec_returns = {
      stdout: "",
      stderr: "",
      exitCode: 124,
      timedOut: true,
      platform: "linux-bwrap",
    };
    const ctx = makeCtx(sb, "auto", "/some/cwd");
    const result = await shellTool.execute(
      { command: "sleep 999" },
      ctx,
    );
    expect(result.content).toContain("(timeout)");
  });

  test("toggling mode mid-session: each call reads sandboxMode independently", async () => {
    const sb = new RecordingSandbox();
    const ctx1 = makeCtx(sb, "off", process.cwd());
    await shellTool.execute({ command: "echo a" }, ctx1);
    const ctx2 = makeCtx(sb, "auto", "/x");
    await shellTool.execute({ command: "echo b" }, ctx2);
    const ctx3 = makeCtx(sb, "off", process.cwd());
    await shellTool.execute({ command: "echo c" }, ctx3);
    // Only the auto call routed through the sandbox.
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0]!.command).toContain("echo b");
  });

  test("undefined sandboxMode (legacy ctx) is treated as off — backwards compat", async () => {
    const sb = new RecordingSandbox();
    // Simulate a legacy caller that didn't pass sandboxMode.
    const ctx = {
      ...makeCtx(sb, "auto", process.cwd()),
      sandboxMode: undefined as unknown as SandboxMode,
    };
    await shellTool.execute({ command: "echo OK" }, ctx);
    // Defensive: undefined !== "auto"/"strict" so the sandbox path skips.
    expect(sb.calls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// C. Cross-cutting concerns
// ────────────────────────────────────────────────────────────

describe("sandbox cross-cutting", () => {
  test("/sandbox auto + invalid arg afterwards keeps the persisted value", async () => {
    const ctx = makeSlashCtx("off");
    await sandboxCommand.execute(["auto"], ctx);
    await sandboxCommand.execute(["nonsense"], ctx);
    const cfg = JSON.parse(
      await readFile(join(tempHome, ".dirgha", "config.json"), "utf8"),
    );
    // The bad arg must NOT roll back the prior good setting.
    expect(cfg.sandbox).toBe("auto");
  });

  test("malformed config file: /sandbox still works (writes fresh)", async () => {
    await writeFile(
      join(tempHome, ".dirgha", "config.json"),
      "{ this is not valid json",
      "utf8",
    );
    await sandboxCommand.execute(["strict"], makeSlashCtx("off"));
    const cfg = JSON.parse(
      await readFile(join(tempHome, ".dirgha", "config.json"), "utf8"),
    );
    expect(cfg.sandbox).toBe("strict");
  });
});
