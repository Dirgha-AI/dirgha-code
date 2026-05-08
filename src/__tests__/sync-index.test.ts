/**
 * sync-index tests (Sprint 6 — docs/cli/index/agent-db.md).
 *
 * Walks a tempdir with seeded markdown files, verifies that
 * `embedding_meta` rows land for each, mtime-keyed skip works on
 * unchanged files, and unlinking a file deletes its index row.
 *
 * Uses an in-memory SQLite DB so we don't touch ~/.dirgha/dirgha.db.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, utimes, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import {
  syncMemoryAndKb,
  ensureIndexStateTable,
  getKbChunkStats,
} from "../state/sync-index.js";

const _require = createRequire(import.meta.url);
const DatabaseCtor = _require("better-sqlite3") as new (
  path: string,
) => import("better-sqlite3").Database;

function setupDb(): import("better-sqlite3").Database {
  const db = new DatabaseCtor(":memory:");
  db.exec(`
    CREATE TABLE embedding_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      chunk TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX idx_embedding_meta_source ON embedding_meta(source);
  `);
  ensureIndexStateTable(db);
  return db;
}

async function seed(home: string): Promise<void> {
  const memDir = join(home, ".dirgha", "memory");
  const kbDir = join(home, ".dirgha", "knowledge");
  await mkdir(memDir, { recursive: true });
  await mkdir(kbDir, { recursive: true });
  await writeFile(
    join(memDir, "alpha.md"),
    "# Alpha\n\nFirst memory body.",
    "utf8",
  );
  await writeFile(
    join(memDir, "beta.md"),
    "# Beta\n\nSecond memory body.",
    "utf8",
  );
  await writeFile(
    join(kbDir, "ref.md"),
    "# Reference\n\nA knowledge article.",
    "utf8",
  );
  // Skip the human-readable derived index files — sync-index must ignore.
  await writeFile(
    join(memDir, "MEMORY.md"),
    "# Memory Index\n",
    "utf8",
  );
  await writeFile(
    join(kbDir, "INDEX.md"),
    "# Knowledge Base\n",
    "utf8",
  );
}

describe("syncMemoryAndKb (Sprint 6)", () => {
  let home: string;
  let db: import("better-sqlite3").Database;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "dirgha-sync-"));
    db = setupDb();
    await seed(home);
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    db.close();
  });

  test("indexes 3 markdown files (2 memory + 1 kb), skipping derived indexes", () => {
    const summary = syncMemoryAndKb(db, { home });
    expect(summary.inserted).toBe(3);
    expect(summary.updated).toBe(0);
    expect(summary.deleted).toBe(0);

    const rows = db
      .prepare(
        "SELECT source FROM embedding_meta WHERE source LIKE 'memory:%' OR source LIKE 'kb:%' ORDER BY source",
      )
      .all() as { source: string }[];
    expect(rows.map((r) => r.source)).toEqual([
      "kb:ref",
      "memory:alpha",
      "memory:beta",
    ]);
  });

  test("second sync skips unchanged files via mtime check", () => {
    syncMemoryAndKb(db, { home });
    const summary = syncMemoryAndKb(db, { home });
    expect(summary.unchanged).toBe(3);
    expect(summary.inserted).toBe(0);
    expect(summary.updated).toBe(0);
  });

  test("editing a file updates the index row", async () => {
    syncMemoryAndKb(db, { home });

    const file = join(home, ".dirgha", "memory", "alpha.md");
    await writeFile(file, "# Alpha\n\nUpdated body.", "utf8");
    // Bump mtime explicitly — some filesystems have low-res timestamps.
    const future = new Date(Date.now() + 60_000);
    await utimes(file, future, future);

    const summary = syncMemoryAndKb(db, { home });
    expect(summary.updated).toBe(1);
    expect(summary.inserted).toBe(0);

    const row = db
      .prepare("SELECT chunk FROM embedding_meta WHERE source = ?")
      .get("memory:alpha") as { chunk: string };
    expect(row.chunk).toContain("Updated body");
  });

  test("unlinking a file removes its index row on next sync", async () => {
    syncMemoryAndKb(db, { home });
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM embedding_meta").get() as { c: number }).c,
    ).toBe(3);

    await unlink(join(home, ".dirgha", "memory", "beta.md"));

    const summary = syncMemoryAndKb(db, { home });
    expect(summary.deleted).toBe(1);

    const remaining = db
      .prepare("SELECT source FROM embedding_meta ORDER BY source")
      .all() as { source: string }[];
    expect(remaining.map((r) => r.source)).toEqual([
      "kb:ref",
      "memory:alpha",
    ]);
  });

  test("re-index after manual DB wipe rebuilds cleanly", () => {
    syncMemoryAndKb(db, { home });
    // Simulate `rm -rf ~/.dirgha/dirgha.db` — wipe both tables, re-sync.
    db.exec("DELETE FROM embedding_meta; DELETE FROM index_state;");

    const summary = syncMemoryAndKb(db, { home });
    expect(summary.inserted).toBe(3);
    expect(summary.deleted).toBe(0);
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM embedding_meta").get() as { c: number }).c,
    ).toBe(3);
  });

  test("handles missing memory/knowledge directories gracefully", async () => {
    const empty = await mkdtemp(join(tmpdir(), "dirgha-empty-"));
    try {
      const freshDb = setupDb();
      const summary = syncMemoryAndKb(freshDb, { home: empty });
      expect(summary.inserted).toBe(0);
      expect(summary.deleted).toBe(0);
      freshDb.close();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  test("does not delete unrelated embedding_meta rows", () => {
    db.prepare(
      "INSERT INTO embedding_meta(source, chunk, ts) VALUES (?, ?, ?)",
    ).run("session:foo", "chat content", Date.now());

    syncMemoryAndKb(db, { home });
    // Add the existing rows, but a stale unlink shouldn't touch session:foo.
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM embedding_meta WHERE source = 'session:foo'")
      .get() as { c: number };
    expect(row.c).toBe(1);
  });

  test("getKbChunkStats reports count + latest sync", () => {
    syncMemoryAndKb(db, { home });
    const stats = getKbChunkStats(db);
    expect(stats.count).toBe(3);
    expect(stats.latestSync).toBeGreaterThan(0);
  });
});
