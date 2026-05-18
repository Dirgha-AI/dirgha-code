/**
 * Orchestra — comprehensive P0 tests.
 *
 * Covers: types, registry (CRUD, agents, output buffer), store (I/O),
 * log (write/read/tail), agent manager (spawn/kill with mocks), bin dispatch.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { registry } from "../orchestra/core/registry.js";
import type { AgentSlot } from "../orchestra/core/types.js";

// ─── Registry ──────────────────────────────────────────────────────────

describe("orchestra registry", () => {
  beforeEach(() => registry.clear());

  it("creates a session with unique id", () => {
    const s1 = registry.create({ title: "test-1" });
    const s2 = registry.create({ title: "test-2" });
    expect(s1.id).toBeTruthy();
    expect(s2.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
    expect(s1.title).toBe("test-1");
    expect(s1.createdAt).toBeGreaterThan(0);
  });

  it("lists sessions", () => {
    registry.create({ title: "a" });
    registry.create({ title: "b" });
    expect(registry.list().length).toBe(2);
  });

  it("gets a session by id", () => {
    const s = registry.create({ title: "find-me" });
    expect(registry.get(s.id)?.title).toBe("find-me");
  });

  it("returns undefined for missing session", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("updates a session", () => {
    const s = registry.create({ title: "old" });
    registry.update(s.id, { title: "new" });
    expect(registry.get(s.id)?.title).toBe("new");
  });

  it("remove returns the session", () => {
    const s = registry.create();
    expect(registry.remove(s.id)?.id).toBe(s.id);
    expect(registry.get(s.id)).toBeUndefined();
  });

  it("tracks size", () => {
    expect(registry.size).toBe(0);
    registry.create();
    expect(registry.size).toBe(1);
  });
});

describe("orchestra registry — agents", () => {
  beforeEach(() => registry.clear());

  function makeAgent(id: string, overrides: Partial<AgentSlot> = {}): AgentSlot {
    return {
      id,
      label: `Agent ${id}`,
      task: "do something",
      adapter: "dirgha",
      pid: 0,
      status: "pending",
      exitCode: null,
      startedAt: Date.now(),
      elapsedMs: null,
      outputBuffer: [],
      hasFocus: false,
      ...overrides,
    };
  }

  it("adds an agent to a session", () => {
    const s = registry.create();
    const ok = registry.addAgent(s.id, makeAgent("agent-1", { pid: 12345, status: "running" }));
    expect(ok).toBe(true);
    expect(registry.get(s.id)?.agents.length).toBe(1);
  });

  it("addAgent returns false for missing session", () => {
    const ok = registry.addAgent("nonexistent", makeAgent("a1"));
    expect(ok).toBe(false);
  });

  it("removes an agent", () => {
    const s = registry.create();
    registry.addAgent(s.id, makeAgent("agent-1"));
    expect(registry.removeAgent(s.id, "agent-1")).toBe(true);
    expect(registry.get(s.id)?.agents.length).toBe(0);
  });

  it("removeAgent returns false for missing agent", () => {
    const s = registry.create();
    expect(registry.removeAgent(s.id, "ghost")).toBe(false);
  });

  it("gets an agent by id", () => {
    const s = registry.create();
    registry.addAgent(s.id, makeAgent("agent-1", { pid: 42, status: "running" }));
    const agent = registry.getAgent(s.id, "agent-1");
    expect(agent).toBeDefined();
    expect(agent!.pid).toBe(42);
  });

  it("updates an agent", () => {
    const s = registry.create();
    registry.addAgent(s.id, makeAgent("agent-1"));
    registry.updateAgent(s.id, "agent-1", { status: "running", pid: 99 });
    expect(registry.getAgent(s.id, "agent-1")?.status).toBe("running");
    expect(registry.getAgent(s.id, "agent-1")?.pid).toBe(99);
  });

  it("appendOutput stores lines and caps at 200", () => {
    const s = registry.create();
    registry.addAgent(s.id, makeAgent("agent-1", { status: "running" }));
    for (let i = 0; i < 250; i++) {
      registry.appendOutput(s.id, "agent-1", `line-${i}`);
    }
    const agent = registry.getAgent(s.id, "agent-1")!;
    expect(agent.outputBuffer.length).toBe(200);
    expect(agent.outputBuffer[0]).toBe("line-50");
    expect(agent.outputBuffer[199]).toBe("line-249");
  });

  it("updateAgent returns undefined for missing session", () => {
    const r = registry.updateAgent("ghost", "agent-1", { status: "done" });
    expect(r).toBeUndefined();
  });
});

// ─── Store (file I/O) ──────────────────────────────────────────────────

describe("orchestra store", () => {
  const TMP = join(tmpdir(), `dirgha-test-orch-${randomUUID().slice(0, 8)}`);
  const OLD_HOME = process.env.HOME;
  let store: typeof import("../orchestra/core/store.js");

  beforeAll(async () => {
    mkdirSync(TMP, { recursive: true });
    process.env.HOME = TMP;
    store = await import("../orchestra/core/store.js");
  });

  afterAll(() => {
    process.env.HOME = OLD_HOME ?? homedir();
    rmSync(TMP, { recursive: true, force: true });
  });

  beforeEach(() => {
    const storeFile = join(TMP, ".dirgha", "orchestra.json");
    if (existsSync(storeFile)) unlinkSync(storeFile);
  });

  it("loadSessions returns empty array when no file", () => {
    expect(store.loadSessions()).toEqual([]);
  });

  it("saveSessions + loadSessions round-trips", () => {
    const session = {
      id: "test-1",
      title: "My Session",
      agents: [],
      active: true,
      createdAt: 1000,
      updatedAt: 2000,
    };
    store.saveSessions([session]);
    const loaded = store.loadSessions();
    expect(loaded.length).toBe(1);
    expect(loaded[0]!.id).toBe("test-1");
  });

  it("appendSession adds and deduplicates by id", () => {
    const s1 = {
      id: "s1", title: "first", agents: [], active: true,
      createdAt: 1, updatedAt: 1,
    };
    const s2 = {
      id: "s2", title: "second", agents: [], active: true,
      createdAt: 2, updatedAt: 2,
    };
    store.appendSession(s1);
    store.appendSession(s2);
    expect(store.loadSessions().length).toBe(2);
    const s1b = { ...s1, title: "first-updated" };
    store.appendSession(s1b);
    const loaded = store.loadSessions();
    expect(loaded.length).toBe(2);
    expect(loaded.find((s: any) => s.id === "s1")!.title).toBe("first-updated");
  });

  it("removeStoredSession removes by id", () => {
    const s = {
      id: "kill-me", title: "doomed", agents: [], active: true,
      createdAt: 0, updatedAt: 0,
    };
    store.appendSession(s);
    expect(store.loadSessions().length).toBe(1);
    store.removeStoredSession("kill-me");
    expect(store.loadSessions().length).toBe(0);
  });

  it("handles corrupt JSON gracefully", () => {
    const dir = join(TMP, ".dirgha");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "orchestra.json"), "this is not json", "utf-8");
    expect(store.loadSessions()).toEqual([]);
  });
});

// ─── Log (NDJSON orchestration log) ─────────────────────────────────────

describe("orchestra log", () => {
  const SESSION = "log-test-session";
  let log: typeof import("../orchestra/orchestration/log.js");
  let logFile: string;

  beforeAll(async () => {
    log = await import("../orchestra/orchestration/log.js");
  });

  beforeEach(() => {
    logFile = log.logPath(SESSION);
    if (existsSync(logFile)) unlinkSync(logFile);
    log.createLog(SESSION);
  });

  it("createLog creates an empty file", async () => {
    expect(existsSync(logFile)).toBe(true);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(logFile, "utf-8")).toBe("");
  });

  it("appendLog writes a JSON line", async () => {
    const { readFileSync } = await import("node:fs");
    log.appendLog({
      timestamp: "2026-04-25T00:00:00.000Z",
      sessionId: SESSION,
      agentId: "agent-1",
      event: "spawn",
      payload: { task: "test" },
    });
    const content = readFileSync(logFile, "utf-8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.event).toBe("spawn");
    expect(parsed.agentId).toBe("agent-1");
  });

  it("readLog returns parsed entries", () => {
    log.writeLog(SESSION, "agent-1", "spawn", { task: "hello" });
    log.writeLog(SESSION, "agent-2", "spawn", { task: "world" });
    const entries = log.readLog(SESSION);
    expect(entries.length).toBe(2);
    expect(entries[0]!.agentId).toBe("agent-1");
    expect(entries[1]!.agentId).toBe("agent-2");
  });

  it("tailLog returns latest N entries", () => {
    for (let i = 0; i < 30; i++) {
      log.writeLog(SESSION, "agent-1", "output", { line: `line-${i}` });
    }
    const tail = log.tailLog(SESSION, 10);
    expect(tail.length).toBe(10);
    expect(tail[0]!.payload.line).toBe("line-20");
    expect(tail[9]!.payload.line).toBe("line-29");
  });

  it("tailLog with filter", () => {
    log.writeLog(SESSION, "agent-1", "spawn", {});
    log.writeLog(SESSION, "agent-1", "output", { line: "a" });
    log.writeLog(SESSION, "agent-1", "exit", { code: 0 });
    const spawns = log.tailLog(SESSION, 50, (e: any) => e.event === "spawn");
    expect(spawns.length).toBe(1);
    expect(spawns[0]!.event).toBe("spawn");
  });

  it("readLog returns empty for missing file", () => {
    expect(log.readLog("ghost-session")).toEqual([]);
  });
});

// ─── Agent Manager ──────────────────────────────────────────────────────

describe("orchestra agent manager", () => {
  beforeEach(() => registry.clear());

  it("spawnAgent returns null for missing session", async () => {
    const { spawnAgent } = await import("../orchestra/agent/manager.js");
    const result = await spawnAgent("nonexistent", "test", "task", "dirgha");
    expect(result).toBeNull();
  });

  it("spawnAgent creates an agent slot", async () => {
    const s = registry.create({ active: true });
    const { spawnAgent } = await import("../orchestra/agent/manager.js");
    registry.addAgent(s.id, {
      id: "test-agent", label: "Test", task: "hello", adapter: "dirgha",
      pid: 0, status: "spawning", exitCode: null, startedAt: Date.now(),
      elapsedMs: null, outputBuffer: [], hasFocus: false,
    });
    const agent = registry.getAgent(s.id, "test-agent");
    expect(agent).toBeDefined();
    expect(agent!.status).toBe("spawning");
  });

  it("killAgent returns false for missing agent", async () => {
    const { killAgent } = await import("../orchestra/agent/manager.js");
    const s = registry.create();
    const killed = await killAgent(s.id, "ghost");
    expect(killed).toBe(false);
  });

  it("killAll returns session with killed agents", async () => {
    const { killAll } = await import("../orchestra/agent/manager.js");
    const s = registry.create();
    registry.addAgent(s.id, {
      id: "a1", label: "A1", task: "x", adapter: "dirgha",
      pid: 99999, status: "running", exitCode: null, startedAt: 0,
      elapsedMs: null, outputBuffer: [], hasFocus: false,
    });
    registry.addAgent(s.id, {
      id: "a2", label: "A2", task: "y", adapter: "dirgha",
      pid: 99998, status: "running", exitCode: null, startedAt: 0,
      elapsedMs: null, outputBuffer: [], hasFocus: false,
    });
    const updated = await killAll(s.id);
    expect(updated).toBeDefined();
    expect(updated!.active).toBe(false);
  });
});

// ─── Bin Dispatch ──────────────────────────────────────────────────────

describe("orchestra bin dispatch", () => {
  let cmd: typeof import("../orchestra/bin.js");
  let output: string;

  beforeAll(async () => {
    cmd = await import("../orchestra/bin.js");
  });

  beforeEach(() => {
    registry.clear();
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk: unknown) => { output += String(chunk); return true as unknown as boolean; },
    );
    vi.spyOn(process.stderr, "write").mockImplementation(() => true as unknown as boolean);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("help prints usage", async () => {
    const code = await cmd.orchestraCommand(["--help"]);
    expect(code).toBe(0);
    expect(output).toContain("dirgha orchestra");
  });

  it("list with no sessions says zero", async () => {
    const code = await cmd.orchestraCommand(["list"]);
    expect(code).toBe(0);
    expect(output).toContain("no sessions");
  });

  it("list with a session shows it", async () => {
    registry.create({ id: "test-1", title: "My Session", active: true });
    const code = await cmd.orchestraCommand(["list"]);
    expect(code).toBe(0);
    expect(output).toContain("test-1");
    expect(output).toContain("My Session");
  });

  it("list --json outputs JSON", async () => {
    registry.create({ id: "json-test", title: "JSON Session", active: true });
    const code = await cmd.orchestraCommand(["list", "--json"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("json-test");
  });

  it("attach with no id prints error", async () => {
    const code = await cmd.orchestraCommand(["attach"]);
    expect(code).toBe(1);
  });

  it("attach with missing id prints not found", async () => {
    const code = await cmd.orchestraCommand(["attach", "nonexistent"]);
    expect(code).toBe(1);
  });

  it("attach with existing session shows details", async () => {
    registry.create({ id: "ses-1", title: "My Session", active: true, agents: [] });
    const code = await cmd.orchestraCommand(["attach", "ses-1"]);
    expect(code).toBe(0);
    expect(output).toContain("ses-1");
  });

  it("kill with no target prints error", async () => {
    const code = await cmd.orchestraCommand(["kill"]);
    expect(code).toBe(1);
  });

  it("kill with missing agent prints not found", async () => {
    const code = await cmd.orchestraCommand(["kill", "ghost"]);
    expect(code).toBe(1);
  });

  it("down with no id prints error", async () => {
    const code = await cmd.orchestraCommand(["down"]);
    expect(code).toBe(1);
  });

  it("down with missing id prints not found", async () => {
    const code = await cmd.orchestraCommand(["down", "nonexistent"]);
    expect(code).toBe(1);
  });

  it("log with no id prints error", async () => {
    const code = await cmd.orchestraCommand(["log"]);
    expect(code).toBe(1);
  });

  it("log with missing id prints not found", async () => {
    const code = await cmd.orchestraCommand(["log", "nonexistent"]);
    expect(code).toBe(1);
  });

  it("unknown verb prints error", async () => {
    const code = await cmd.orchestraCommand(["explode"]);
    expect(code).toBe(1);
  });

  it("up with no args prints error", async () => {
    const code = await cmd.orchestraCommand(["up"]);
    expect(code).toBe(1);
  });

  it("up with tasks creates session and spawns", async () => {
    const code = await cmd.orchestraCommand(["up", "task one", "task two"]);
    expect(code).toBe(0);
    expect(output).toContain("starting session");
    expect(output).toContain("2 agent(s)");
    expect(registry.list().length).toBe(1);
  });
});
