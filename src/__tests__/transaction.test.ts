/**
 * Single-transaction API tests (Sprint 4 — docs/cli/index/agent-db.md).
 *
 * Uses in-memory SQLite databases for test isolation. The production
 * `openDb()` singleton resolves DB_PATH at module-load time so HOME
 * redirects in beforeEach come too late — the same workaround
 * graph.test.ts uses.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { transactional } from "../state/transaction.js";

const _require = createRequire(import.meta.url);
const DatabaseCtor = _require("better-sqlite3") as new (
  path: string,
) => import("better-sqlite3").Database;

function setupDb(): import("better-sqlite3").Database {
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
    -- The vec0 virtual table requires the sqlite-vec extension which
    -- isn't loaded for in-memory test DBs. Create a regular table with
    -- the same shape so transaction.ts's embedding.insert can run.
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
    INSERT INTO sessions(id, started_at) VALUES ('default', 0);
  `);
  return db;
}

describe("transactional API (Sprint 4)", () => {
  let db: import("better-sqlite3").Database;

  beforeEach(() => {
    db = setupDb();
  });

  test("commits message + 2 graph nodes + 1 edge atomically", () => {
    transactional((tx) => {
      tx.message.insert({ role: "user", content: "hello" });
      tx.graph.addNode({ id: "n1", type: "msg" });
      tx.graph.addNode({ id: "n2", type: "msg" });
      tx.graph.addEdge({ src: "n1", dst: "n2", rel: "follows" });
    }, db);
    const m = db.prepare("SELECT COUNT(*) AS c FROM messages").get() as { c: number };
    const n = db.prepare("SELECT COUNT(*) AS c FROM graph_nodes").get() as { c: number };
    const e = db.prepare("SELECT COUNT(*) AS c FROM graph_edges").get() as { c: number };
    expect(m.c).toBe(1);
    expect(n.c).toBe(2);
    expect(e.c).toBe(1);
  });

  test("rolls back on throw — partial state never visible", () => {
    expect(() => {
      transactional((tx) => {
        tx.message.insert({ role: "user", content: "before-throw" });
        tx.graph.addNode({ id: "wont-stick", type: "msg" });
        throw new Error("boom");
      }, db);
    }).toThrow(/boom/);
    const m = db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE content='before-throw'")
      .get() as { c: number };
    expect(m.c).toBe(0);
    const n = db
      .prepare("SELECT COUNT(*) AS c FROM graph_nodes WHERE id='wont-stick'")
      .get() as { c: number };
    expect(n.c).toBe(0);
  });

  test("empty embedding vec throws + rolls back the whole transaction", () => {
    expect(() => {
      transactional((tx) => {
        tx.graph.addNode({ id: "x", type: "n" });
        tx.embedding.insert({ source: "kb:x", chunk: "x", vec: [] });
      }, db);
    }).toThrow(/non-empty/);
    const n = db
      .prepare("SELECT COUNT(*) AS c FROM graph_nodes WHERE id='x'")
      .get() as { c: number };
    expect(n.c).toBe(0);
  });

  test("addNode upsert — second call with same id updates props", () => {
    transactional((tx) => {
      tx.graph.addNode({ id: "u1", type: "user", props: { name: "alice" } });
    }, db);
    transactional((tx) => {
      tx.graph.addNode({ id: "u1", type: "user", props: { name: "alice", title: "engineer" } });
    }, db);
    const row = db.prepare("SELECT props FROM graph_nodes WHERE id='u1'").get() as { props: string };
    const props = JSON.parse(row.props);
    expect(props.title).toBe("engineer");
  });

  test("addEdge upsert on (src,dst,rel) composite key", () => {
    transactional((tx) => {
      tx.graph.addNode({ id: "a", type: "x" });
      tx.graph.addNode({ id: "b", type: "x" });
      tx.graph.addEdge({ src: "a", dst: "b", rel: "links", props: { weight: 1 } });
      tx.graph.addEdge({ src: "a", dst: "b", rel: "links", props: { weight: 2 } });
    }, db);
    const e = db.prepare("SELECT COUNT(*) AS c FROM graph_edges").get() as { c: number };
    const w = db.prepare("SELECT props FROM graph_edges WHERE src='a' AND dst='b' AND rel='links'").get() as { props: string };
    expect(e.c).toBe(1);  // upserted, not duplicated
    expect(JSON.parse(w.props).weight).toBe(2);
  });
});
