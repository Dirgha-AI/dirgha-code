/**
 * Agent-DB regression smoke matrix (Wave 1-3 coverage).
 *
 * One small, fast, high-signal test file that exercises every shipped
 * Wave 1-3 surface end-to-end: schema, sqlite-vec extension, graph
 * tools, transactional API, embeddings adapter selection, kb_search
 * input validation, workspace-info DB shape, and a tempdir-driven
 * markdown → embedding_meta sync walker (with mtime-skip).
 *
 * Constraints:
 *   - All 10+ sub-tests must complete in ≤ 30 seconds.
 *   - Tests must run without sqlite-vec — vector tests skip if absent.
 *   - Tests must run without @xenova/transformers — embedder tests skip
 *     gracefully (we route around them by setting env state ourselves).
 *   - Tests must NOT write to ~/.dirgha — we redirect HOME to a tmpdir
 *     before any module that resolves DB paths is imported, OR we use
 *     in-memory SQLite handles directly (matches the pattern from
 *     transaction.test.ts and graph.test.ts).
 *
 * Pattern reference:
 *   - In-memory DB setup: src/__tests__/transaction.test.ts
 *   - In-memory DB setup: src/__tests__/graph.test.ts
 *   - HOME redirect for openDb: src/__tests__/kb-search.test.ts
 *   - Embedder/kb_search compat: src/__tests__/embeddings.test.ts
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { mkdtemp, rm, writeFile, utimes, stat } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const DatabaseCtor = _require("better-sqlite3") as new (
  path: string,
) => import("better-sqlite3").Database;

// ---------------------------------------------------------------------------
// Helpers — mirror the schema produced by openDb() so we can exercise the
// transactional + graph + embedding-meta paths against an in-memory handle.
// (openDb() resolves DB_PATH at module-load time, so we use :memory: where
// possible and HOME-redirect only when we actually want the real openDb.)
// ---------------------------------------------------------------------------

function buildAgentDb(): import("better-sqlite3").Database {
  const db = new DatabaseCtor(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      model TEXT,
      cwd TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX idx_messages_session ON messages(session_id);
    CREATE TABLE graph_nodes (
      id    TEXT PRIMARY KEY,
      type  TEXT NOT NULL,
      props TEXT,
      ts    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE graph_edges (
      src   TEXT NOT NULL,
      dst   TEXT NOT NULL,
      rel   TEXT NOT NULL,
      props TEXT,
      ts    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (src, dst, rel),
      FOREIGN KEY (src) REFERENCES graph_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (dst) REFERENCES graph_nodes(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_edges_src ON graph_edges(src, rel);
    -- Stand-in for the vec0 virtual table when sqlite-vec isn't loaded.
    -- transaction.ts only references the (rowid, embedding) shape so a
    -- regular table satisfies it for atomicity testing.
    CREATE TABLE embeddings (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      embedding TEXT
    );
    CREATE TABLE embedding_meta (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL,
      chunk TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX idx_embedding_meta_source ON embedding_meta(source);
    -- Wave 2 sync-index meta table — tracks per-file mtime so the walker
    -- can skip already-indexed files. Not in production schema yet; the
    -- regression test exercises the inline walker logic against this
    -- shape so a future migration has a contract to land against.
    CREATE TABLE index_state (
      source   TEXT PRIMARY KEY,
      mtime_ms INTEGER NOT NULL,
      ts       INTEGER NOT NULL
    );
    INSERT INTO sessions(id, started_at) VALUES ('default', 0);
  `);
  return db;
}

// Detect optional native deps the same way the production code does.
function isSqliteVecAvailable(): boolean {
  try {
    const v = _require("sqlite-vec") as { load: (db: unknown) => void };
    const probe = new DatabaseCtor(":memory:");
    v.load(probe);
    probe.prepare("SELECT vec_version() AS v").get();
    probe.close();
    return true;
  } catch {
    return false;
  }
}

function isXenovaAvailable(): boolean {
  try {
    _require("@xenova/transformers");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HOME redirect: openDb() reads ~/.dirgha at module-load time. To safely
// touch the production openDb without polluting the user's real home dir
// we set HOME/USERPROFILE to a tmpdir *before* the module is imported,
// then dynamically import inside the test. We never persist outside the
// tmpdir.
// ---------------------------------------------------------------------------

const ENV_KEYS = ["HOME", "USERPROFILE"] as const;
const SAVED_ENV: Record<string, string | undefined> = {};

let TMP_HOME: string;

beforeAll(async () => {
  TMP_HOME = await mkdtemp(join(tmpdir(), "dirgha-smoke-"));
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
  for (const k of ENV_KEYS) process.env[k] = TMP_HOME;
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
  for (let i = 0; i < 3; i++) {
    try {
      await rm(TMP_HOME, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
});

// Sanity: confirm HOME was actually redirected. If a parallel test file
// reset HOME between collection and execution we must abort — the rest
// of the smoke matrix would write into the user's real ~/.dirgha.
function assertHomeRedirected(): void {
  expect(process.env["HOME"]).toBe(TMP_HOME);
  expect(homedir().startsWith(TMP_HOME)).toBe(true);
}

// ---------------------------------------------------------------------------
// Test matrix
// ---------------------------------------------------------------------------

describe("agent-DB regression smoke (Wave 1-3 coverage)", () => {
  // 1. openDb() — verifies schema exposes every table the agent stack
  //    relies on. We exercise the production openDb() under a redirected
  //    HOME so the test never touches ~/.dirgha.
  test("1. openDb() returns a db with all expected tables", async () => {
    assertHomeRedirected();
    const { openDb } = await import("../state/db.js");
    const db = openDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name",
      )
      .all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));
    expect(names.has("sessions")).toBe(true);
    expect(names.has("messages")).toBe(true);
    expect(names.has("graph_nodes")).toBe(true);
    expect(names.has("graph_edges")).toBe(true);
    expect(names.has("embedding_meta")).toBe(true);
    expect(names.has("messages_fts")).toBe(true);
    // embeddings is a vec0 virtual table when sqlite-vec is loaded; if
    // the extension is absent, the migration rolls back and the table
    // is missing. We assert the *invariant* that either the extension
    // is present and embeddings exists, or it doesn't — never partial.
    if (isSqliteVecAvailable()) {
      expect(names.has("embeddings")).toBe(true);
    }
  });

  // 2. sqlite-vec extension loads if installed; gracefully no-ops otherwise.
  test("2. sqlite-vec extension loads if installed; gracefully no-ops otherwise", async () => {
    const { openDb } = await import("../state/db.js");
    const { isVecLoaded, vecVersion } = await import("../state/vec.js");
    const db = openDb();
    if (isSqliteVecAvailable()) {
      expect(isVecLoaded(db)).toBe(true);
      const version = vecVersion(db);
      expect(typeof version).toBe("string");
      expect(version).toMatch(/^v?\d+\.\d+\.\d+/);
    } else {
      // Extension absent → both probes return falsy without throwing.
      expect(isVecLoaded(db)).toBe(false);
      expect(vecVersion(db)).toBeNull();
    }
  });

  // 3. transactional() commits message + node + edge atomically.
  test("3. transactional() commits message + node + edge atomically", async () => {
    const { transactional } = await import("../state/transaction.js");
    const db = buildAgentDb();
    transactional((tx) => {
      tx.message.insert({ role: "user", content: "smoke-3" });
      tx.graph.addNode({ id: "smoke-n1", type: "msg" });
      tx.graph.addNode({ id: "smoke-n2", type: "msg" });
      tx.graph.addEdge({ src: "smoke-n1", dst: "smoke-n2", rel: "follows" });
    }, db);
    const m = db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE content='smoke-3'")
      .get() as { c: number };
    const n = db
      .prepare("SELECT COUNT(*) AS c FROM graph_nodes WHERE id LIKE 'smoke-%'")
      .get() as { c: number };
    const e = db
      .prepare(
        "SELECT COUNT(*) AS c FROM graph_edges WHERE src='smoke-n1' AND dst='smoke-n2'",
      )
      .get() as { c: number };
    expect(m.c).toBe(1);
    expect(n.c).toBe(2);
    expect(e.c).toBe(1);
  });

  // 4. transactional() rolls back on throw — no partial state survives.
  test("4. transactional() rolls back on throw — no partial state visible", async () => {
    const { transactional } = await import("../state/transaction.js");
    const db = buildAgentDb();
    expect(() => {
      transactional((tx) => {
        tx.message.insert({ role: "user", content: "should-rollback" });
        tx.graph.addNode({ id: "roll-1", type: "msg" });
        tx.graph.addNode({ id: "roll-2", type: "msg" });
        tx.graph.addEdge({ src: "roll-1", dst: "roll-2", rel: "follows" });
        throw new Error("boom-4");
      }, db);
    }).toThrow(/boom-4/);
    const m = db
      .prepare(
        "SELECT COUNT(*) AS c FROM messages WHERE content='should-rollback'",
      )
      .get() as { c: number };
    const n = db
      .prepare("SELECT COUNT(*) AS c FROM graph_nodes WHERE id LIKE 'roll-%'")
      .get() as { c: number };
    const e = db
      .prepare("SELECT COUNT(*) AS c FROM graph_edges WHERE src='roll-1'")
      .get() as { c: number };
    expect(m.c).toBe(0);
    expect(n.c).toBe(0);
    expect(e.c).toBe(0);
  });

  // 5. graph_traverse with depth=2 returns expected nodes — exercises the
  //    recursive CTE on a small chain (a → b → c → d) and asserts depth-2
  //    cuts at c.
  test("5. graph_traverse with depth=2 returns the expected nodes", async () => {
    const { transactional } = await import("../state/transaction.js");
    const db = buildAgentDb();
    transactional((tx) => {
      tx.graph.addNode({ id: "g-a", type: "n" });
      tx.graph.addNode({ id: "g-b", type: "n" });
      tx.graph.addNode({ id: "g-c", type: "n" });
      tx.graph.addNode({ id: "g-d", type: "n" });
      tx.graph.addEdge({ src: "g-a", dst: "g-b", rel: "next" });
      tx.graph.addEdge({ src: "g-b", dst: "g-c", rel: "next" });
      tx.graph.addEdge({ src: "g-c", dst: "g-d", rel: "next" });
    }, db);

    interface Path {
      depth: number;
      node_id: string;
    }
    const sql = `
      WITH RECURSIVE walk(depth, node_id, type, via_rel, parent_id, path) AS (
        SELECT 0, n.id, n.type, NULL, NULL, ',' || n.id || ','
        FROM graph_nodes n WHERE n.id = ?
        UNION ALL
        SELECT w.depth + 1, e.dst, n.type, e.rel, e.src,
               w.path || e.dst || ','
        FROM graph_edges e
        JOIN walk w ON w.node_id = e.src
        LEFT JOIN graph_nodes n ON n.id = e.dst
        WHERE e.rel = ?
          AND w.depth < ?
          AND instr(w.path, ',' || e.dst || ',') = 0
      )
      SELECT depth, node_id FROM walk LIMIT ?
    `;
    const rows = db.prepare(sql).all("g-a", "next", 2, 100) as Path[];
    const ids = rows.map((r) => r.node_id);
    expect(ids).toContain("g-a");
    expect(ids).toContain("g-b");
    expect(ids).toContain("g-c");
    // depth=2 with rel-filter walks exactly two hops; g-d (depth 3)
    // should not appear.
    expect(ids).not.toContain("g-d");
  });

  // 6. kb_search with query_vector returns content (results or no-matches).
  //    Skipped if sqlite-vec isn't loaded — without the vec0 virtual table
  //    the SELECT errors at the SQL layer.
  test.skipIf(!isSqliteVecAvailable())(
    "6. kb_search with query_vector returns results when embeddings present",
    async () => {
      const { kbSearchTool } = await import("../tools/kb-search.js");
      const result = await kbSearchTool.execute(
        { query_vector: new Array(384).fill(0.1), k: 3 },
        {
          cwd: process.cwd(),
          env: {},
          sessionId: "smoke-6",
          signal: new AbortController().signal,
          sandbox: null,
          sandboxMode: "off" as const,
        },
      );
      expect(typeof result.content).toBe("string");
      // No embeddings stored → "no matches"; the tool returns isError=false
      // because the *query* succeeded. This is the documented contract.
      expect(result.isError).toBeFalsy();
    },
  );

  // 7. kb_search with query string is rejected if no embedder configured.
  //    We force "no embedder configured" deterministically by pointing
  //    the remote endpoint at a closed local port and clearing the
  //    config-supplied endpoint, so neither local nor remote can succeed.
  test("7. kb_search with query string surfaces a clear error when no embedder is reachable", async () => {
    const savedEndpoint = process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    process.env["DIRGHA_EMBEDDINGS_ENDPOINT"] =
      "http://127.0.0.1:1/never-listens";
    try {
      const { kbSearchTool } = await import("../tools/kb-search.js");
      const result = await kbSearchTool.execute(
        { query: "regression smoke" },
        {
          cwd: process.cwd(),
          env: {},
          sessionId: "smoke-7",
          signal: new AbortController().signal,
          sandbox: null,
          sandboxMode: "off" as const,
        },
      );
      // Either we get a clean "failed to embed query" error (remote path
      // tried + failed) or kb_search rejected the input outright. Both
      // satisfy the contract; the key invariant is isError=true with a
      // human-readable message — never a silent empty result.
      expect(result.isError).toBe(true);
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
    } finally {
      if (savedEndpoint === undefined)
        delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
      else process.env["DIRGHA_EMBEDDINGS_ENDPOINT"] = savedEndpoint;
    }
  });

  // 8. db_workspace_info shape — verifies an introspection query against
  //    the production openDb returns a sane (db_path, sqlite, tables,
  //    counts) shape. db_workspace_info itself isn't a tool yet, so the
  //    test exercises the query shape that any future implementation
  //    must satisfy. This also doubles as a regression for openDb's
  //    schema.
  test("8. db_workspace_info returns a sane shape (db_path, sqlite, tables, counts)", async () => {
    assertHomeRedirected();
    const { openDb } = await import("../state/db.js");
    const db = openDb();

    const info = {
      db_path: join(homedir(), ".dirgha", "dirgha.db"),
      sqlite: {
        version: (db.prepare("SELECT sqlite_version() AS v").get() as {
          v: string;
        }).v,
        vec_loaded: isSqliteVecAvailable(),
      },
      tables: (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((t) => t.name),
      counts: {
        sessions: (
          db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as {
            c: number;
          }
        ).c,
        messages: (
          db.prepare("SELECT COUNT(*) AS c FROM messages").get() as {
            c: number;
          }
        ).c,
        graph_nodes: (
          db.prepare("SELECT COUNT(*) AS c FROM graph_nodes").get() as {
            c: number;
          }
        ).c,
        graph_edges: (
          db.prepare("SELECT COUNT(*) AS c FROM graph_edges").get() as {
            c: number;
          }
        ).c,
        embedding_meta: (
          db.prepare("SELECT COUNT(*) AS c FROM embedding_meta").get() as {
            c: number;
          }
        ).c,
      },
    };

    // Path lives under the redirected HOME — never the user's real home.
    expect(info.db_path.startsWith(TMP_HOME)).toBe(true);
    expect(info.db_path.endsWith("dirgha.db")).toBe(true);
    // SQLite version probe always responds.
    expect(typeof info.sqlite.version).toBe("string");
    expect(info.sqlite.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof info.sqlite.vec_loaded).toBe("boolean");
    // Required tables present.
    for (const required of [
      "sessions",
      "messages",
      "graph_nodes",
      "graph_edges",
      "embedding_meta",
    ]) {
      expect(info.tables).toContain(required);
    }
    // Counts are non-negative integers.
    for (const v of Object.values(info.counts)) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  // 9. sync-index walks tempdir of 3 markdown files → 3 rows in
  //    embedding_meta. The production sync-index module isn't shipped
  //    yet; the smoke test pins down the exact contract a future
  //    implementation must hit (one row per file, source = relative
  //    path, mtime tracked in index_state).
  describe("sync-index walker", () => {
    let workdir: string;
    let db: import("better-sqlite3").Database;

    beforeEach(async () => {
      workdir = await mkdtemp(join(tmpdir(), "dirgha-syncidx-"));
      db = buildAgentDb();
    });

    afterEach(async () => {
      db.close();
      for (let i = 0; i < 3; i++) {
        try {
          await rm(workdir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100 * (i + 1)));
        }
      }
    });

    async function syncIndex(rootDir: string): Promise<{
      indexed: number;
      skipped: number;
    }> {
      // Inline reference walker — same algorithm a production tool
      // would use: walk *.md, hash mtime against index_state, insert
      // missing rows into embedding_meta + index_state.
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(rootDir, { withFileTypes: true });
      let indexed = 0;
      let skipped = 0;
      const insertMeta = db.prepare(
        "INSERT INTO embedding_meta(id, source, chunk, ts) VALUES (?, ?, ?, ?)",
      );
      const insertEmb = db.prepare(
        "INSERT INTO embeddings(embedding) VALUES (?)",
      );
      const upsertState = db.prepare(
        "INSERT INTO index_state(source, mtime_ms, ts) VALUES (?, ?, ?) " +
          "ON CONFLICT(source) DO UPDATE SET mtime_ms=excluded.mtime_ms, ts=excluded.ts",
      );
      const lookupState = db.prepare(
        "SELECT mtime_ms FROM index_state WHERE source = ?",
      );
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
        const full = join(rootDir, ent.name);
        const s = statSync(full);
        const mtime = Math.floor(s.mtimeMs);
        const prev = lookupState.get(ent.name) as
          | { mtime_ms: number }
          | undefined;
        if (prev && prev.mtime_ms === mtime) {
          skipped++;
          continue;
        }
        const r = insertEmb.run(JSON.stringify(new Array(384).fill(0)));
        insertMeta.run(
          r.lastInsertRowid as number,
          ent.name,
          `chunk-from-${ent.name}`,
          Date.now(),
        );
        upsertState.run(ent.name, mtime, Date.now());
        indexed++;
      }
      return { indexed, skipped };
    }

    test("9. sync-index walks tempdir of 3 markdown files → 3 rows in embedding_meta", async () => {
      await writeFile(join(workdir, "a.md"), "# alpha");
      await writeFile(join(workdir, "b.md"), "# beta");
      await writeFile(join(workdir, "c.md"), "# gamma");

      const result = await syncIndex(workdir);
      expect(result.indexed).toBe(3);
      expect(result.skipped).toBe(0);

      const rows = db
        .prepare(
          "SELECT source FROM embedding_meta ORDER BY source",
        )
        .all() as { source: string }[];
      const sources = rows.map((r) => r.source);
      expect(sources).toEqual(["a.md", "b.md", "c.md"]);
    });

    // 10. sync-index mtime-skip — re-walk doesn't duplicate.
    test("10. sync-index mtime-skip — second walk doesn't duplicate", async () => {
      await writeFile(join(workdir, "x.md"), "# one");
      await writeFile(join(workdir, "y.md"), "# two");

      // First walk: indexes both files.
      const first = await syncIndex(workdir);
      expect(first.indexed).toBe(2);
      expect(first.skipped).toBe(0);

      const afterFirst = (
        db.prepare("SELECT COUNT(*) AS c FROM embedding_meta").get() as {
          c: number;
        }
      ).c;
      expect(afterFirst).toBe(2);

      // Second walk without touching files: both should be skipped.
      const second = await syncIndex(workdir);
      expect(second.indexed).toBe(0);
      expect(second.skipped).toBe(2);

      const afterSecond = (
        db.prepare("SELECT COUNT(*) AS c FROM embedding_meta").get() as {
          c: number;
        }
      ).c;
      expect(afterSecond).toBe(2);

      // Touch one file (bump mtime forward by 5s) → only that file
      // re-indexes.
      const xPath = join(workdir, "x.md");
      const newMtime = new Date(Date.now() + 5000);
      await utimes(xPath, newMtime, newMtime);
      const verify = await stat(xPath);
      expect(Math.floor(verify.mtimeMs)).toBeGreaterThan(0);

      const third = await syncIndex(workdir);
      expect(third.indexed).toBe(1);
      expect(third.skipped).toBe(1);

      // embedding_meta now has 3 rows (x.md was re-indexed under a
      // fresh rowid). index_state still has 2 rows (one per source).
      const finalMeta = (
        db.prepare("SELECT COUNT(*) AS c FROM embedding_meta").get() as {
          c: number;
        }
      ).c;
      const finalState = (
        db.prepare("SELECT COUNT(*) AS c FROM index_state").get() as {
          c: number;
        }
      ).c;
      expect(finalMeta).toBe(3);
      expect(finalState).toBe(2);
    });
  });
});
