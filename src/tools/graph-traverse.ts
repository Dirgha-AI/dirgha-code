/**
 * graph_traverse tool — recursive forward traversal from a starting node.
 *
 * Uses a SQLite recursive CTE to walk graph_edges. Returns each reachable
 * node with depth, the relation it was reached via, and the parent node.
 * Bounded by max_depth + max_results. Cycles are detected and skipped via
 * a path-tracking column.
 */

import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { openDb } from "../state/db.js";

interface Input {
  start_id: string;
  rel?: string;
  max_depth?: number;
  max_results?: number;
}

interface Path {
  depth: number;
  node_id: string;
  type: string | null;
  via_rel: string | null;
  parent_id: string | null;
}

export const graphTraverseTool: Tool = {
  name: "graph_traverse",
  description:
    "Recursive forward traversal from a starting node. Returns each " +
    "reachable node with its depth, the relation it was reached via, and " +
    "the parent. Bounded by max_depth + max_results to prevent runaway " +
    "queries on cyclic graphs (cycles are detected and skipped).",
  inputSchema: {
    type: "object",
    properties: {
      start_id: { type: "string" },
      rel: { type: "string" },
      max_depth: { type: "integer", minimum: 1, maximum: 50 },
      max_results: { type: "integer", minimum: 1, maximum: 10000 },
    },
    required: ["start_id"],
  },
  async execute(rawInput: unknown, _ctx): Promise<ToolResult<Path[]>> {
    const input = rawInput as Input;
    if (!input.start_id) {
      return { content: "start_id is required", isError: true };
    }
    const maxDepth = input.max_depth ?? 3;
    const maxResults = input.max_results ?? 100;
    const db = openDb();
    try {
      const sql = input.rel
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
      const params = input.rel
        ? [input.start_id, input.rel, maxDepth, maxResults]
        : [input.start_id, maxDepth, maxResults];
      const rows = db.prepare(sql).all(...params) as Path[];
      const summary =
        rows.length === 0
          ? `node ${input.start_id} not found or has no outgoing edges`
          : rows
              .map(
                (p) =>
                  `${"  ".repeat(p.depth)}${p.depth === 0 ? "●" : "→"} ${p.node_id}` +
                  `${p.type ? ` [${p.type}]` : ""}` +
                  `${p.via_rel ? ` (via ${p.via_rel})` : ""}`,
              )
              .join("\n");
      return { content: summary, data: rows, isError: false };
    } catch (err) {
      return {
        content: `graph_traverse failed: ${(err as Error).message}`,
        isError: true,
      };
    }
  },
};
