/**
 * db_workspace_info tool tests (Sprint 7 — docs/cli/index/agent-db.md).
 *
 * Verifies the tool returns a string with the expected sections and
 * that the structured `data` payload includes path, version, tables,
 * and counts. Also confirms that the soul prompt advertises the new
 * tools so the agent knows they exist.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Tool } from "../tools/registry.js";

// NOTE: db.ts captures DB_DIR/DB_PATH at module load time using
// `homedir()`, so we set HOME *before* dynamically importing the tool
// (matching the pattern used by kb-search.test.ts). A static top-level
// import would resolve DB paths against the parent process's HOME and
// silently target /root/.dirgha — which has stale schema from older
// CLI versions.

function makeCtx() {
  return {
    cwd: process.cwd(),
    env: {},
    sessionId: "t",
    signal: new AbortController().signal,
    sandbox: null,
    sandboxMode: "off" as const,
  };
}

describe("db_workspace_info tool", () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let dbWorkspaceInfoTool: Tool;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "dirgha-dbinfo-"));
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = tempHome;
    process.env["USERPROFILE"] = tempHome;
    const mod = await import("../tools/db-workspace-info.js");
    dbWorkspaceInfoTool = mod.dbWorkspaceInfoTool;
  });

  afterEach(async () => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserProfile !== undefined)
      process.env["USERPROFILE"] = originalUserProfile;
    else delete process.env["USERPROFILE"];
    // Windows EBUSY: better-sqlite3 holds the file handle past db.close().
    // Retry with backoff; swallow on final failure (test artifacts are tmp).
    for (let i = 0; i < 3; i++) {
      try {
        await rm(tempHome, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
  });

  test("returns a content string with all expected sections", async () => {
    const result = await dbWorkspaceInfoTool.execute({}, makeCtx());
    expect(result.isError).toBe(false);
    expect(typeof result.content).toBe("string");
    const content = result.content as string;
    expect(content).toContain("db_path:");
    expect(content).toContain("sqlite:");
    expect(content).toContain("vec:");
    expect(content).toContain("tables:");
    expect(content).toContain("counts:");
  });

  test("data payload includes structured fields", async () => {
    const result = await dbWorkspaceInfoTool.execute({}, makeCtx());
    expect(result.data).toBeDefined();
    const data = result.data as {
      dbPath: string;
      sqliteVersion: string;
      vecVersion: string | null;
      tables: string[];
      counts: Record<string, number>;
    };
    expect(typeof data.dbPath).toBe("string");
    expect(data.dbPath.length).toBeGreaterThan(0);
    expect(typeof data.sqliteVersion).toBe("string");
    expect(Array.isArray(data.tables)).toBe(true);
    expect(typeof data.counts).toBe("object");
  });

  test("counts include the four canonical multi-model tables", async () => {
    const result = await dbWorkspaceInfoTool.execute({}, makeCtx());
    const data = result.data as {
      counts: Record<string, number>;
    };
    expect(Object.keys(data.counts)).toEqual(
      expect.arrayContaining([
        "messages",
        "graph_nodes",
        "graph_edges",
        "embedding_meta",
      ]),
    );
  });

  test("tables list contains the core schema", async () => {
    const result = await dbWorkspaceInfoTool.execute({}, makeCtx());
    const data = result.data as { tables: string[] };
    expect(data.tables).toEqual(
      expect.arrayContaining([
        "messages",
        "graph_nodes",
        "graph_edges",
        "embedding_meta",
      ]),
    );
  });

  test("tool definition has the expected name and empty input schema", () => {
    expect(dbWorkspaceInfoTool.name).toBe("db_workspace_info");
    expect(dbWorkspaceInfoTool.inputSchema.type).toBe("object");
    expect(dbWorkspaceInfoTool.description.length).toBeGreaterThan(40);
  });
});

describe("soul prompt advertises new tools (Sprint 7)", () => {
  test("default soul mentions transactional_write, kb_search, graph_*, db_workspace_info", async () => {
    const { loadSoul } = await import("../context/soul.js");
    const soul = loadSoul();
    const text = soul.text;
    expect(text).toContain("transactional_write");
    expect(text).toContain("kb_search");
    expect(text).toContain("graph_neighbors");
    expect(text).toContain("graph_traverse");
    expect(text).toContain("db_workspace_info");
  });
});
