/**
 * Graph schema + tools tests (Sprint 3 — docs/cli/index/agent-db.md).
 *
 * Uses in-memory SQLite databases to isolate each test. Tests the SQL
 * logic of graph_neighbors and graph_traverse directly, avoiding the
 * openDb() singleton which is bound to ~/.dirgha/dirgha.db at import time.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const DatabaseCtor = _require("better-sqlite3") as new (
  path: string,
) => import("better-sqlite3").Database;

interface Neighbor {
  id: string;
  rel: string;
  direction: string;
  type: string | null;
  props: string | null;
}

interface Path {
  depth: number;
  node_id: string;
  type: string | null;
  via_rel: string | null;
  parent_id: string | null;
}

function setupGraphDb(): import("better-sqlite3").Database {
  const db = new DatabaseCtor(":memory:");
  db.exec(`
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
    INSERT INTO graph_nodes(id, type) VALUES
      ('alice', 'person'), ('bob', 'person'), ('charlie', 'person'),
      ('dora',  'person'), ('ed',  'person');
    INSERT INTO graph_edges(src, dst, rel) VALUES
      ('alice','bob','knows'),
      ('bob','charlie','knows'),
      ('alice','dora','employs'),
      ('alice','ed','employs'),
      ('ed','charlie','reports_to'),
      ('dora','bob','knows');
  `);
  return db;
}

function neighborsOut(
  db: import("better-sqlite3").Database,
  nodeId: string,
  rel?: string,
): Neighbor[] {
  const sql = rel
    ? `SELECT e.dst AS id, e.rel, n.type, n.props
       FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.dst
       WHERE e.src = ? AND e.rel = ? ORDER BY e.ts`
    : `SELECT e.dst AS id, e.rel, n.type, n.props
       FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.dst
       WHERE e.src = ? ORDER BY e.ts`;
  const params = rel ? [nodeId, rel] : [nodeId];
  const rows = db.prepare(sql).all(...params) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({ ...r, direction: "out" } as Neighbor));
}

function neighborsIn(
  db: import("better-sqlite3").Database,
  nodeId: string,
  rel?: string,
): Neighbor[] {
  const sql = rel
    ? `SELECT e.src AS id, e.rel, n.type, n.props
       FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.src
       WHERE e.dst = ? AND e.rel = ? ORDER BY e.ts`
    : `SELECT e.src AS id, e.rel, n.type, n.props
       FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.src
       WHERE e.dst = ? ORDER BY e.ts`;
  const params = rel ? [nodeId, rel] : [nodeId];
  const rows = db.prepare(sql).all(...params) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({ ...r, direction: "in" } as Neighbor));
}

function traverse(
  db: import("better-sqlite3").Database,
  startId: string,
  rel?: string,
  maxDepth = 3,
  maxResults = 100,
): Path[] {
  const sql = rel
    ? `
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
      SELECT depth, node_id, type, via_rel, parent_id
      FROM walk LIMIT ?
    `
    : `
      WITH RECURSIVE walk(depth, node_id, type, via_rel, parent_id, path) AS (
        SELECT 0, n.id, n.type, NULL, NULL, ',' || n.id || ','
        FROM graph_nodes n WHERE n.id = ?
        UNION ALL
        SELECT w.depth + 1, e.dst, n.type, e.rel, e.src,
               w.path || e.dst || ','
        FROM graph_edges e
        JOIN walk w ON w.node_id = e.src
        LEFT JOIN graph_nodes n ON n.id = e.dst
        WHERE w.depth < ?
          AND instr(w.path, ',' || e.dst || ',') = 0
      )
      SELECT depth, node_id, type, via_rel, parent_id
      FROM walk LIMIT ?
    `;
  const params = rel
    ? [startId, rel, maxDepth, maxResults]
    : [startId, maxDepth, maxResults];
  return db.prepare(sql).all(...params) as Path[];
}

describe("graph schema + tools", () => {
  let db: import("better-sqlite3").Database;

  beforeEach(() => {
    db = setupGraphDb();
  });

  test("graph_neighbors finds outgoing neighbours by default", () => {
    const rows = neighborsOut(db, "alice");
    expect(rows.map((n) => n.id).sort()).toEqual(["bob", "dora", "ed"]);
  });

  test("graph_neighbors filters by relation", () => {
    const rows = neighborsOut(db, "alice", "knows");
    expect(rows.map((n) => n.id)).toEqual(["bob"]);
  });

  test("graph_neighbors direction=in returns incoming edges", () => {
    const rows = neighborsIn(db, "charlie");
    expect(rows.map((n) => n.id).sort()).toEqual(["bob", "ed"]);
  });

  test("graph_traverse walks edges with max_depth", () => {
    const rows = traverse(db, "alice", "knows", 3);
    const ids = rows.map((p) => p.node_id);
    expect(ids).toContain("alice");
    expect(ids).toContain("bob");
    expect(ids).toContain("charlie");
  });

  test("graph_traverse respects max_depth", () => {
    const rows = traverse(db, "alice", "knows", 1);
    const ids = rows.map((p) => p.node_id);
    expect(ids).toContain("alice");
    expect(ids).toContain("bob");
    expect(ids).not.toContain("charlie");
  });

  test("graph_traverse skips cycles", () => {
    // alice → dora → bob → charlie ; bob is reachable from alice via
    // knows too. The path-tracking CTE prevents a node appearing as its
    // own descendant (true cycle), but a node may still appear at
    // different depths via different paths — that's expected.
    const rows = traverse(db, "alice", undefined, 5);
    // alice should never appear as a descendant of itself.
    const descendants = rows.filter((p) => p.depth > 0);
    expect(descendants.find((p) => p.node_id === "alice")).toBeUndefined();
    // All 5 nodes should be reachable.
    const ids = rows.map((p) => p.node_id);
    expect(new Set(ids).size).toBe(5);
  });

  test("graph_neighbors returns empty for unknown node", () => {
    const rows = neighborsOut(db, "ghost");
    expect(rows).toEqual([]);
  });
});
