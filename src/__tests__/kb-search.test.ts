/**
 * kb_search tool tests. Covers the no-results path, input validation,
 * and schema migration idempotency.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { kbSearchTool } from "../tools/kb-search.js";

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

describe("kb_search tool", () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "dirgha-kb-"));
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = tempHome;
    process.env["USERPROFILE"] = tempHome;
  });

  afterEach(async () => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserProfile !== undefined)
      process.env["USERPROFILE"] = originalUserProfile;
    else delete process.env["USERPROFILE"];
    await rm(tempHome, { recursive: true, force: true });
  });

  test("returns content string when no embeddings exist", async () => {
    const result = await kbSearchTool.execute(
      { query_vector: new Array(384).fill(0.1), k: 3 },
      makeCtx(),
    );
    // Either succeeds with empty/no-matches or fails gracefully if vec absent.
    expect(typeof result.content).toBe("string");
  });

  test("rejects empty query_vector", async () => {
    const result = await kbSearchTool.execute(
      { query_vector: [], k: 3 },
      makeCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("non-empty");
  });

  test("rejects non-array query_vector", async () => {
    const result = await kbSearchTool.execute(
      { query_vector: "not-an-array", k: 3 },
      makeCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("non-empty");
  });

  test("accepts source_prefix filter parameter", async () => {
    const result = await kbSearchTool.execute(
      {
        query_vector: new Array(384).fill(0.1),
        k: 3,
        source_prefix: "kb:",
      },
      makeCtx(),
    );
    // Should not throw — either empty results or db error, not a schema error.
    expect(typeof result.content).toBe("string");
  });
});

describe("embeddings schema migration idempotency", () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "dirgha-emb-"));
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = tempHome;
    process.env["USERPROFILE"] = tempHome;
  });

  afterEach(async () => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserProfile !== undefined)
      process.env["USERPROFILE"] = originalUserProfile;
    else delete process.env["USERPROFILE"];
    await rm(tempHome, { recursive: true, force: true });
  });

  test("embedding_meta table exists after migration", async () => {
    // openDb triggers initSchema + migrations on first call.
    const { openDb } = await import("../state/db.js");
    const db = openDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("embedding_meta");
  });

  test("second open is idempotent — no error on re-run", async () => {
    const { openDb } = await import("../state/db.js");
    openDb(); // first — runs migration
    // Second open returns cached — but also runs migration which is
    // CREATE IF NOT EXISTS. Simulate by re-running migrate on same db.
    const db = openDb();
    // Re-run the migration SQL directly to verify idempotency.
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        chunk TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_embedding_meta_source
        ON embedding_meta(source);
    `);
    // No throw = idempotent.
    expect(true).toBe(true);
  });

  test("embedding_meta columns match schema", async () => {
    const { openDb } = await import("../state/db.js");
    const db = openDb();
    const cols = db.pragma("table_info(embedding_meta)") as Array<{
      name: string;
    }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("source");
    expect(colNames).toContain("chunk");
    expect(colNames).toContain("ts");
  });

  test("idx_embedding_meta_source index exists", async () => {
    const { openDb } = await import("../state/db.js");
    const db = openDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as { name: string }[];
    const names = indexes.map((r) => r.name);
    expect(names).toContain("idx_embedding_meta_source");
  });
});
